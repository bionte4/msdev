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
  createTimesheetSchema,
  deleteTimesheetSchema,
  listTimesheetsSchema,
  updateTimesheetSchema,
  type CreateTimesheetInput,
  type DeleteTimesheetInput,
  type ListTimesheetsInput,
  type UpdateTimesheetInput,
} from "@/lib/validations/timesheet";
import { getWeekBounds, toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

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
  totalHours: number;
  overtimeHours: number;
  remainingToHardCap: number;
  warningThreshold: number;
  hardCap: number;
  isNearCap: boolean;
  isOverCap: boolean;
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
      };
    case "VENDOR_LEAD":
      return {
        canCreate: true,
        canEditOwn: true,
        canEditTeam: true,
        canDeleteOwn: true,
        canDeleteTeam: true,
        canSelectDeveloper: true,
      };
    case "SYS_ADMIN":
      return {
        canCreate: true,
        canEditOwn: true,
        canEditTeam: true,
        canDeleteOwn: true,
        canDeleteTeam: true,
        canSelectDeveloper: true,
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
      };
    default:
      return {
        canCreate: false,
        canEditOwn: false,
        canEditTeam: false,
        canDeleteOwn: false,
        canDeleteTeam: false,
        canSelectDeveloper: false,
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
    const { weekStart, weekEnd } = getWeekBounds(
      parsed.data.weekStart ?? new Date()
    );

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
        workDate: { gte: weekStart, lte: weekEnd },
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
    });

    const mapped = entries.map((e) => mapEntry(e, session, perms));
    const totalHours = mapped.reduce((sum, e) => sum + e.hours, 0);
    const overtimeHours = mapped
      .filter((e) => e.isOvertime)
      .reduce((sum, e) => sum + e.hours, 0);

    return ok({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      totalHours,
      overtimeHours,
      remainingToHardCap: Math.max(0, MAX_WEEKLY_HOURS_HARD_CAP - totalHours),
      warningThreshold: WEEKLY_HOURS_WARNING,
      hardCap: MAX_WEEKLY_HOURS_HARD_CAP,
      isNearCap: totalHours >= WEEKLY_HOURS_WARNING,
      isOverCap: totalHours >= MAX_WEEKLY_HOURS_HARD_CAP,
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
  ActionResult<{ id: string; name: string }[]>
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
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    });

    return ok(
      developers.map((d) => ({
        id: d.id,
        name: d.user.name,
      }))
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load developers";
    return fail(message);
  }
}

/** @deprecated Prefer listTimesheets */
export async function getWeeklyTimesheetSummary(weekStartInput?: Date) {
  return listTimesheets({ weekStart: weekStartInput });
}
