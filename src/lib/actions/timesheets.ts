"use server";

import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import {
  MAX_DAILY_HOURS,
  MAX_WEEKLY_HOURS_HARD_CAP,
  WEEKLY_HOURS_WARNING,
} from "@/lib/constants";
import {
  CAP_MESSAGES,
  TIMESHEET_IMPORT_HEADERS,
  bulkImportTimesheetsSchema,
  createTimesheetSchema,
  deleteTimesheetSchema,
  listTimesheetsSchema,
  updateTimesheetSchema,
  type BulkImportTimesheetsInput,
  type CreateTimesheetInput,
  type DeleteTimesheetInput,
  type ListTimesheetsInput,
  type UpdateTimesheetInput,
} from "@/lib/validations/timesheet";
import { getWeekBounds, toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";
import * as XLSX from "xlsx";

export interface TimesheetEntry {
  id: string;
  developerId: string;
  developerName: string;
  projectId: string;
  projectName: string;
  workDate: string;
  hours: number;
  taskSummary: string;
  isOvertime: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TimesheetListResult {
  weekStart: string;
  weekEnd: string;
  periodFrom: string;
  periodTo: string;
  totalHours: number;
  overtimeHours: number;
  remainingToHardCap: number;
  warningThreshold: number;
  hardCap: number;
  isNearCap: boolean;
  isOverCap: boolean;
  showWeeklyCap: boolean;
  permissions: TimesheetPermissions;
  entries: TimesheetEntry[];
}

export interface TimesheetPermissions {
  canCreate: boolean;
  canEditOwn: boolean;
  canEditTeam: boolean;
  canDeleteOwn: boolean;
  canDeleteTeam: boolean;
  canSelectDeveloper: boolean;
  canImport: boolean;
}

export interface TimesheetImportResult {
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

type AuthedSession = NonNullable<Session>;

function permissionsFor(role: Role): TimesheetPermissions {
  switch (role) {
    case "DEVELOPER":
      return {
        canCreate: true,
        canEditOwn: true,
        canEditTeam: false,
        canDeleteOwn: true,
        canDeleteTeam: false,
        canSelectDeveloper: false,
        canImport: true,
      };
    case "VENDOR_LEAD":
      return {
        canCreate: true,
        canEditOwn: true,
        canEditTeam: true,
        canDeleteOwn: true,
        canDeleteTeam: true,
        canSelectDeveloper: true,
        canImport: true,
      };
    case "SYS_ADMIN":
      return {
        canCreate: true,
        canEditOwn: true,
        canEditTeam: true,
        canDeleteOwn: true,
        canDeleteTeam: true,
        canSelectDeveloper: true,
        canImport: true,
      };
    case "CLIENT_PM":
    case "VENDOR_AM":
      return {
        canCreate: false,
        canEditOwn: false,
        canEditTeam: false,
        canDeleteOwn: false,
        canDeleteTeam: false,
        canSelectDeveloper: false,
        canImport: false,
      };
    default:
      return {
        canCreate: false,
        canEditOwn: false,
        canEditTeam: false,
        canDeleteOwn: false,
        canDeleteTeam: false,
        canSelectDeveloper: false,
        canImport: false,
      };
  }
}

function mapEntry(
  entry: {
    id: string;
    developerId: string;
    projectId: string;
    workDate: Date;
    hours: unknown;
    taskSummary: string;
    isOvertime: boolean;
    project: { name: string };
    developer: { user: { name: string }; clientId: string };
  },
  session: AuthedSession,
  perms: TimesheetPermissions
): TimesheetEntry {
  const isOwn = entry.developerId === session.user.developerId;
  const sameClient =
    !session.user.clientId ||
    session.user.role === "SYS_ADMIN" ||
    entry.developer.clientId === session.user.clientId;

  const canEdit =
    sameClient &&
    ((isOwn && perms.canEditOwn) || (!isOwn && perms.canEditTeam));
  const canDelete =
    sameClient &&
    ((isOwn && perms.canDeleteOwn) || (!isOwn && perms.canDeleteTeam));

  return {
    id: entry.id,
    developerId: entry.developerId,
    developerName: entry.developer.user.name,
    projectId: entry.projectId,
    projectName: entry.project.name,
    workDate: entry.workDate.toISOString().slice(0, 10),
    hours: toNumber(entry.hours),
    taskSummary: entry.taskSummary,
    isOvertime: entry.isOvertime,
    canEdit,
    canDelete,
  };
}

async function assertCanAccessDeveloper(
  session: AuthedSession,
  developerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
  });

  if (!developer || !developer.isActive) {
    return { ok: false, error: "Developer not found or inactive" };
  }

  if (session.user.role === "SYS_ADMIN") {
    return { ok: true };
  }

  if (session.user.developerId === developerId) {
    return { ok: true };
  }

  if (
    ["VENDOR_LEAD", "CLIENT_PM", "VENDOR_AM"].includes(session.user.role) &&
    session.user.clientId &&
    developer.clientId === session.user.clientId
  ) {
    return { ok: true };
  }

  return { ok: false, error: "Unauthorized access to developer timesheet" };
}

async function resolveTargetDeveloperId(
  session: AuthedSession,
  requestedDeveloperId: string | undefined,
  perms: TimesheetPermissions
): Promise<{ ok: true; developerId: string } | { ok: false; error: string }> {
  if (requestedDeveloperId) {
    if (!perms.canSelectDeveloper && requestedDeveloperId !== session.user.developerId) {
      return {
        ok: false,
        error: "You can only manage your own timesheet entries",
      };
    }

    const access = await assertCanAccessDeveloper(session, requestedDeveloperId);
    if (!access.ok) return access;

    return { ok: true, developerId: requestedDeveloperId };
  }

  if (!session.user.developerId) {
    return {
      ok: false,
      error: "Developer profile is required, or select a developer",
    };
  }

  return { ok: true, developerId: session.user.developerId };
}

async function validateCaps(params: {
  developerId: string;
  workDate: Date;
  hours: number;
  excludeId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const workDate = new Date(params.workDate);
  workDate.setHours(0, 0, 0, 0);
  const dayEnd = new Date(workDate);
  dayEnd.setHours(23, 59, 59, 999);

  const existingDay = await prisma.timesheet.aggregate({
    where: {
      developerId: params.developerId,
      workDate: { gte: workDate, lte: dayEnd },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    _sum: { hours: true },
  });

  const dayTotal = toNumber(existingDay._sum.hours ?? 0) + params.hours;
  if (dayTotal > MAX_DAILY_HOURS) {
    return {
      ok: false,
      error: `${CAP_MESSAGES.daily} Current day total would be ${dayTotal.toFixed(1)}h.`,
    };
  }

  const { weekStart, weekEnd } = getWeekBounds(workDate);
  const existingWeek = await prisma.timesheet.aggregate({
    where: {
      developerId: params.developerId,
      workDate: { gte: weekStart, lte: weekEnd },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    _sum: { hours: true },
  });

  const weekTotal = toNumber(existingWeek._sum.hours ?? 0) + params.hours;
  if (weekTotal > MAX_WEEKLY_HOURS_HARD_CAP) {
    return {
      ok: false,
      error: `${CAP_MESSAGES.weekly} Current week total would be ${weekTotal.toFixed(1)}h.`,
    };
  }

  return { ok: true };
}

export async function listTimesheets(
  input: ListTimesheetsInput = {}
): Promise<ActionResult<TimesheetListResult>> {
  try {
    const session = await auth();
    assertRole(session, [
      "DEVELOPER",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "CLIENT_PM",
      "SYS_ADMIN",
    ]);

    const parsed = listTimesheetsSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid list query");
    }

    const perms = permissionsFor(session.user.role);
    const hasCustomPeriod = Boolean(parsed.data.from || parsed.data.to);
    let periodFrom: Date;
    let periodTo: Date;
    let weekStart: Date;
    let weekEnd: Date;

    if (hasCustomPeriod) {
      periodFrom = new Date(parsed.data.from ?? parsed.data.to ?? new Date());
      periodTo = new Date(parsed.data.to ?? parsed.data.from ?? new Date());
      periodFrom.setHours(0, 0, 0, 0);
      periodTo.setHours(23, 59, 59, 999);
      const bounds = getWeekBounds(periodFrom);
      weekStart = bounds.weekStart;
      weekEnd = bounds.weekEnd;
    } else {
      const bounds = getWeekBounds(parsed.data.weekStart ?? new Date());
      weekStart = bounds.weekStart;
      weekEnd = bounds.weekEnd;
      periodFrom = weekStart;
      periodTo = weekEnd;
    }

    const spanDays =
      (periodTo.getTime() - periodFrom.getTime()) / (24 * 60 * 60 * 1000);
    const showWeeklyCap = !hasCustomPeriod || spanDays <= 7;

    let developerFilter: string | undefined = parsed.data.developerId;

    if (session.user.role === "DEVELOPER") {
      if (!session.user.developerId) {
        return fail("Developer profile not found");
      }
      developerFilter = session.user.developerId;
    } else if (developerFilter) {
      const access = await assertCanAccessDeveloper(session, developerFilter);
      if (!access.ok) return fail(access.error);
    }

    const entries = await prisma.timesheet.findMany({
      where: {
        workDate: { gte: periodFrom, lte: periodTo },
        ...(developerFilter ? { developerId: developerFilter } : {}),
        ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
          ? { developer: { clientId: session.user.clientId } }
          : {}),
      },
      include: {
        project: true,
        developer: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    const mapped = entries.map((e) => mapEntry(e, session, perms));
    const totalHours = mapped.reduce((sum, e) => sum + e.hours, 0);
    const overtimeHours = mapped
      .filter((e) => e.isOvertime)
      .reduce((sum, e) => sum + e.hours, 0);

    return ok({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      totalHours,
      overtimeHours,
      remainingToHardCap: Math.max(0, MAX_WEEKLY_HOURS_HARD_CAP - totalHours),
      warningThreshold: WEEKLY_HOURS_WARNING,
      hardCap: MAX_WEEKLY_HOURS_HARD_CAP,
      isNearCap: showWeeklyCap && totalHours >= WEEKLY_HOURS_WARNING,
      isOverCap: showWeeklyCap && totalHours >= MAX_WEEKLY_HOURS_HARD_CAP,
      showWeeklyCap,
      permissions: perms,
      entries: mapped,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list timesheets";
    return fail(message);
  }
}

export async function createTimesheet(
  input: CreateTimesheetInput
): Promise<ActionResult<TimesheetEntry>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);

    const perms = permissionsFor(session.user.role);
    if (!perms.canCreate) {
      return fail("Unauthorized to create timesheets");
    }

    const parsed = createTimesheetSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid timesheet data");
    }

    const target = await resolveTargetDeveloperId(
      session,
      parsed.data.developerId,
      perms
    );
    if (!target.ok) return fail(target.error);

    const data = parsed.data;
    const workDate = new Date(data.workDate);
    workDate.setHours(0, 0, 0, 0);

    const caps = await validateCaps({
      developerId: target.developerId,
      workDate,
      hours: data.hours,
    });
    if (!caps.ok) return fail(caps.error);

    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        isActive: true,
        ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
          ? { clientId: session.user.clientId }
          : {}),
      },
    });

    if (!project) {
      return fail("Project not found or inactive");
    }

    const entry = await prisma.timesheet.create({
      data: {
        developerId: target.developerId,
        projectId: data.projectId,
        workDate,
        hours: data.hours,
        taskSummary: data.taskSummary,
        isOvertime: data.isOvertime || data.hours > 8,
      },
      include: {
        project: true,
        developer: { include: { user: { select: { name: true } } } },
      },
    });

    return ok(mapEntry(entry, session, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create timesheet";
    return fail(message);
  }
}

export async function updateTimesheet(
  input: UpdateTimesheetInput
): Promise<ActionResult<TimesheetEntry>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);

    const perms = permissionsFor(session.user.role);
    const parsed = updateTimesheetSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid timesheet data");
    }

    const existing = await prisma.timesheet.findUnique({
      where: { id: parsed.data.id },
      include: {
        project: true,
        developer: { include: { user: { select: { name: true } } } },
      },
    });

    if (!existing) {
      return fail("Timesheet not found");
    }

    const current = mapEntry(existing, session, perms);
    if (!current.canEdit) {
      return fail("Unauthorized to edit this timesheet");
    }

    const targetDeveloperId =
      parsed.data.developerId && perms.canSelectDeveloper
        ? parsed.data.developerId
        : existing.developerId;

    const access = await assertCanAccessDeveloper(session, targetDeveloperId);
    if (!access.ok) return fail(access.error);

    const workDate = new Date(parsed.data.workDate);
    workDate.setHours(0, 0, 0, 0);

    const caps = await validateCaps({
      developerId: targetDeveloperId,
      workDate,
      hours: parsed.data.hours,
      excludeId: existing.id,
    });
    if (!caps.ok) return fail(caps.error);

    const project = await prisma.project.findFirst({
      where: {
        id: parsed.data.projectId,
        isActive: true,
        ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
          ? { clientId: session.user.clientId }
          : {}),
      },
    });

    if (!project) {
      return fail("Project not found or inactive");
    }

    const updated = await prisma.timesheet.update({
      where: { id: existing.id },
      data: {
        developerId: targetDeveloperId,
        projectId: parsed.data.projectId,
        workDate,
        hours: parsed.data.hours,
        taskSummary: parsed.data.taskSummary,
        isOvertime: parsed.data.isOvertime || parsed.data.hours > 8,
      },
      include: {
        project: true,
        developer: { include: { user: { select: { name: true } } } },
      },
    });

    return ok(mapEntry(updated, session, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update timesheet";
    return fail(message);
  }
}

export async function deleteTimesheet(
  input: DeleteTimesheetInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);

    const perms = permissionsFor(session.user.role);
    const parsed = deleteTimesheetSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid delete request");
    }

    const existing = await prisma.timesheet.findUnique({
      where: { id: parsed.data.id },
      include: {
        project: true,
        developer: { include: { user: { select: { name: true } } } },
      },
    });

    if (!existing) {
      return fail("Timesheet not found");
    }

    const current = mapEntry(existing, session, perms);
    if (!current.canDelete) {
      return fail("Unauthorized to delete this timesheet");
    }

    await prisma.timesheet.delete({ where: { id: existing.id } });
    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete timesheet";
    return fail(message);
  }
}

export async function getActiveProjectsForTimesheet(): Promise<
  ActionResult<{ id: string; name: string; code: string }[]>
> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN", "CLIENT_PM"]);

    const where =
      session.user.clientId && session.user.role !== "SYS_ADMIN"
        ? { clientId: session.user.clientId, isActive: true }
        : { isActive: true };

    const projects = await prisma.project.findMany({
      where,
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });

    return ok(projects);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load projects";
    return fail(message);
  }
}

export async function getDevelopersForTimesheet(): Promise<
  ActionResult<{ id: string; name: string; email?: string }[]>
> {
  try {
    const session = await auth();
    assertRole(session, ["VENDOR_LEAD", "SYS_ADMIN", "CLIENT_PM", "VENDOR_AM"]);

    const developers = await prisma.developer.findMany({
      where: {
        isActive: true,
        ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
          ? { clientId: session.user.clientId }
          : {}),
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    });

    return ok(
      developers.map((d) => ({
        id: d.id,
        name: d.user.name,
        email: d.user.email,
      }))
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load developers";
    return fail(message);
  }
}

export async function downloadTimesheetImportTemplate(): Promise<
  ActionResult<{ filename: string; base64: string }>
> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);
    const perms = permissionsFor(session.user.role);
    if (!perms.canImport) return fail("Unauthorized to download import template");

    const sampleEmail =
      session.user.role === "DEVELOPER"
        ? (session.user.email ?? "developer@acme.example")
        : "developer@acme.example";

    const projects = await prisma.project.findMany({
      where: {
        isActive: true,
        ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
          ? { clientId: session.user.clientId }
          : {}),
      },
      select: { code: true },
      take: 1,
      orderBy: { name: "asc" },
    });

    const today = new Date().toISOString().slice(0, 10);
    const sampleCode = projects[0]?.code ?? "PORTAL";

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [...TIMESHEET_IMPORT_HEADERS],
      [
        today,
        sampleEmail,
        sampleCode,
        8,
        "Implemented feature X",
        "No",
      ],
      [
        today,
        sampleEmail,
        sampleCode,
        2,
        "Code review and bugfix",
        "Yes",
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Timesheets");

    const instructions = XLSX.utils.aoa_to_sheet([
      ["Column", "Required", "Notes"],
      ["workDate", "Yes", "YYYY-MM-DD"],
      ["developerEmail", "Yes", "Must match an active developer login email"],
      ["projectCode", "Yes", "Active project code (e.g. PORTAL)"],
      ["hours", "Yes", `0.5 – ${MAX_DAILY_HOURS}`],
      ["taskSummary", "Yes", "Min 5 characters"],
      ["isOvertime", "No", "Yes/No (or true/false/1/0)"],
      ["", "", "Daily max 16h and weekly hard cap 50h are enforced per row"],
    ]);
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    }) as Buffer;

    return ok({
      filename: "timesheet-import-template.xlsx",
      base64: Buffer.from(buffer).toString("base64"),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to build import template";
    return fail(message);
  }
}

export async function bulkImportTimesheetsFromExcel(input: {
  base64: string;
}): Promise<ActionResult<TimesheetImportResult>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);
    const perms = permissionsFor(session.user.role);
    if (!perms.canImport) return fail("Unauthorized to import timesheets");

    if (!input.base64 || input.base64.length < 16) {
      return fail("Import file is empty");
    }

    const binary = Buffer.from(input.base64, "base64");
    const workbook = XLSX.read(binary, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return fail("Excel file has no sheets");

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });

    if (rawRows.length === 0) {
      return fail("No data rows found in the Excel file");
    }

    const normalized = rawRows.map((row) => {
      const get = (...keys: string[]) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== "") return row[key];
          const found = Object.keys(row).find(
            (k) => k.trim().toLowerCase() === key.toLowerCase()
          );
          if (found && row[found] !== undefined && row[found] !== "") {
            return row[found];
          }
        }
        return "";
      };
      return {
        workDate: get("workDate", "work_date", "date"),
        developerEmail: String(
          get("developerEmail", "developer_email", "email")
        )
          .trim()
          .toLowerCase(),
        projectCode: String(get("projectCode", "project_code", "project")),
        hours: get("hours"),
        taskSummary: String(get("taskSummary", "task_summary", "task")),
        isOvertime: get("isOvertime", "is_overtime", "overtime"),
      };
    });

    const parsed = bulkImportTimesheetsSchema.safeParse({ rows: normalized });
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid import file format"
      );
    }

    return bulkImportTimesheets({ rows: parsed.data.rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import timesheets";
    return fail(message);
  }
}

export async function bulkImportTimesheets(
  input: BulkImportTimesheetsInput
): Promise<ActionResult<TimesheetImportResult>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);
    const perms = permissionsFor(session.user.role);
    if (!perms.canImport) return fail("Unauthorized to import timesheets");

    const parsed = bulkImportTimesheetsSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid import payload");
    }

    const errors: { row: number; message: string }[] = [];
    let created = 0;

    for (let i = 0; i < parsed.data.rows.length; i += 1) {
      const row = parsed.data.rows[i];
      const excelRow = i + 2;

      try {
        if (
          session.user.role === "DEVELOPER" &&
          session.user.email &&
          row.developerEmail.toLowerCase() !== session.user.email.toLowerCase()
        ) {
          errors.push({
            row: excelRow,
            message: "Developers may only import their own email",
          });
          continue;
        }

        const developer = await prisma.developer.findFirst({
          where: {
            isActive: true,
            user: { email: row.developerEmail },
            ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
              ? { clientId: session.user.clientId }
              : {}),
          },
        });
        if (!developer) {
          errors.push({
            row: excelRow,
            message: `Developer not found for email ${row.developerEmail}`,
          });
          continue;
        }

        const access = await assertCanAccessDeveloper(session, developer.id);
        if (!access.ok) {
          errors.push({ row: excelRow, message: access.error });
          continue;
        }

        const project = await prisma.project.findFirst({
          where: {
            code: row.projectCode,
            isActive: true,
            ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
              ? { clientId: session.user.clientId }
              : { clientId: developer.clientId }),
          },
        });
        if (!project) {
          errors.push({
            row: excelRow,
            message: `Project code “${row.projectCode}” not found or inactive`,
          });
          continue;
        }

        const workDate = new Date(row.workDate);
        workDate.setHours(0, 0, 0, 0);

        const caps = await validateCaps({
          developerId: developer.id,
          workDate,
          hours: row.hours,
        });
        if (!caps.ok) {
          errors.push({ row: excelRow, message: caps.error });
          continue;
        }

        await prisma.timesheet.create({
          data: {
            developerId: developer.id,
            projectId: project.id,
            workDate,
            hours: row.hours,
            taskSummary: row.taskSummary,
            isOvertime: row.isOvertime || row.hours > 8,
          },
        });
        created += 1;
      } catch (rowError) {
        errors.push({
          row: excelRow,
          message:
            rowError instanceof Error ? rowError.message : "Failed to import row",
        });
      }
    }

    return ok({
      created,
      failed: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import timesheets";
    return fail(message);
  }
}

/** @deprecated Prefer listTimesheets */
export async function getWeeklyTimesheetSummary(weekStartInput?: Date) {
  return listTimesheets({ weekStart: weekStartInput });
}
