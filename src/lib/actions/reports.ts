"use server";

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import {
  REPORT_TYPE_LABELS,
  reportQuerySchema,
  type ReportQueryInput,
  type ReportType,
} from "@/lib/validations/reports";
import { toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportPermissions {
  canView: boolean;
  canExport: boolean;
}

export interface ReportResult {
  type: ReportType;
  label: string;
  from: string;
  to: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  permissions: ReportPermissions;
}

function reportPerms(role: Role): ReportPermissions {
  const lead =
    role === "SYS_ADMIN" ||
    role === "CLIENT_PM" ||
    role === "VENDOR_LEAD" ||
    role === "VENDOR_AM";
  return {
    canView: lead || role === "DEVELOPER",
    canExport: lead || role === "DEVELOPER",
  };
}

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayEnd(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function developerScopeWhere(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>
): Record<string, unknown> {
  if (session.user.role === "DEVELOPER") {
    return { id: session.user.developerId ?? "__none__" };
  }
  if (session.user.role !== "SYS_ADMIN" && session.user.clientId) {
    return { clientId: session.user.clientId };
  }
  return {};
}

async function buildReportRows(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  type: ReportType,
  from: Date,
  to: Date
): Promise<{
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
}> {
  const scope = developerScopeWhere(session);
  const fromD = dayStart(from);
  const toD = dayEnd(to);

  switch (type) {
    case "timesheets": {
      const entries = await prisma.timesheet.findMany({
        where: {
          workDate: { gte: fromD, lte: toD },
          developer: scope,
        },
        include: {
          developer: { include: { user: { select: { name: true, email: true } } } },
          project: { select: { name: true, code: true } },
        },
        orderBy: [{ workDate: "asc" }, { developer: { user: { name: "asc" } } }],
      });
      return {
        columns: [
          { key: "workDate", label: "Work date" },
          { key: "developer", label: "Developer" },
          { key: "email", label: "Email" },
          { key: "project", label: "Project" },
          { key: "projectCode", label: "Project code" },
          { key: "hours", label: "Hours" },
          { key: "overtime", label: "Overtime" },
          { key: "taskSummary", label: "Task summary" },
        ],
        rows: entries.map((e) => ({
          workDate: isoDate(e.workDate),
          developer: e.developer.user.name,
          email: e.developer.user.email,
          project: e.project.name,
          projectCode: e.project.code,
          hours: toNumber(e.hours),
          overtime: e.isOvertime ? "Yes" : "No",
          taskSummary: e.taskSummary,
        })),
      };
    }
    case "projects": {
      const entries = await prisma.timesheet.findMany({
        where: {
          workDate: { gte: fromD, lte: toD },
          developer: scope,
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              code: true,
              client: { select: { name: true, code: true } },
            },
          },
          developer: { include: { user: { select: { name: true } } } },
        },
      });

      const map = new Map<
        string,
        {
          project: string;
          projectCode: string;
          client: string;
          hours: number;
          overtimeHours: number;
          entries: number;
          developers: Set<string>;
        }
      >();

      for (const e of entries) {
        const key = e.projectId;
        const row =
          map.get(key) ??
          {
            project: e.project.name,
            projectCode: e.project.code,
            client: `${e.project.client.name} (${e.project.client.code})`,
            hours: 0,
            overtimeHours: 0,
            entries: 0,
            developers: new Set<string>(),
          };
        const hours = toNumber(e.hours);
        row.hours += hours;
        if (e.isOvertime) row.overtimeHours += hours;
        row.entries += 1;
        row.developers.add(e.developer.user.name);
        map.set(key, row);
      }

      return {
        columns: [
          { key: "project", label: "Project" },
          { key: "projectCode", label: "Code" },
          { key: "client", label: "Client" },
          { key: "hours", label: "Total hours" },
          { key: "overtimeHours", label: "OT hours" },
          { key: "entries", label: "Entries" },
          { key: "developers", label: "Developers" },
        ],
        rows: Array.from(map.values())
          .sort((a, b) => b.hours - a.hours)
          .map((r) => ({
            project: r.project,
            projectCode: r.projectCode,
            client: r.client,
            hours: Number(r.hours.toFixed(2)),
            overtimeHours: Number(r.overtimeHours.toFixed(2)),
            entries: r.entries,
            developers: Array.from(r.developers).join(", "),
          })),
      };
    }
    case "leave": {
      const items = await prisma.leaveRequest.findMany({
        where: {
          OR: [
            { startDate: { gte: fromD, lte: toD } },
            { endDate: { gte: fromD, lte: toD } },
            { AND: [{ startDate: { lte: fromD } }, { endDate: { gte: toD } }] },
          ],
          developer: scope,
        },
        include: {
          developer: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { startDate: "asc" },
      });
      return {
        columns: [
          { key: "developer", label: "Developer" },
          { key: "email", label: "Email" },
          { key: "leaveType", label: "Type" },
          { key: "status", label: "Status" },
          { key: "startDate", label: "Start" },
          { key: "endDate", label: "End" },
          { key: "totalDays", label: "Days" },
          { key: "reason", label: "Reason" },
        ],
        rows: items.map((i) => ({
          developer: i.developer.user.name,
          email: i.developer.user.email,
          leaveType: i.leaveType,
          status: i.status,
          startDate: isoDate(i.startDate),
          endDate: isoDate(i.endDate),
          totalDays: toNumber(i.totalDays),
          reason: i.reason,
        })),
      };
    }
    case "overtime": {
      const items = await prisma.overtimeRequest.findMany({
        where: {
          workDate: { gte: fromD, lte: toD },
          developer: scope,
        },
        include: {
          developer: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: { workDate: "asc" },
      });
      return {
        columns: [
          { key: "workDate", label: "Work date" },
          { key: "developer", label: "Developer" },
          { key: "email", label: "Email" },
          { key: "hours", label: "Requested hours" },
          { key: "status", label: "Status" },
          { key: "reason", label: "Reason" },
        ],
        rows: items.map((i) => ({
          workDate: isoDate(i.workDate),
          developer: i.developer.user.name,
          email: i.developer.user.email,
          hours: toNumber(i.requestedHours),
          status: i.status,
          reason: i.reason,
        })),
      };
    }
    case "evaluations": {
      const fromMonth = fromD.getUTCFullYear() * 100 + (fromD.getUTCMonth() + 1);
      const toMonth = toD.getUTCFullYear() * 100 + (toD.getUTCMonth() + 1);
      const items = await prisma.monthlyEvaluation.findMany({
        where: {
          developer: scope,
        },
        include: {
          developer: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      });
      const filtered = items.filter((i) => {
        const key = i.year * 100 + i.month;
        return key >= fromMonth && key <= toMonth;
      });
      return {
        columns: [
          { key: "period", label: "Period" },
          { key: "developer", label: "Developer" },
          { key: "email", label: "Email" },
          { key: "totalScore", label: "Total score" },
          { key: "codeQuality", label: "Code" },
          { key: "delivery", label: "Delivery" },
          { key: "technical", label: "Tech" },
          { key: "communication", label: "Comm" },
          { key: "professionalism", label: "Prof" },
        ],
        rows: filtered.map((i) => ({
          period: `${String(i.month).padStart(2, "0")}/${i.year}`,
          developer: i.developer.user.name,
          email: i.developer.user.email,
          totalScore: toNumber(i.totalScore),
          codeQuality: toNumber(i.codeQuality),
          delivery: toNumber(i.delivery),
          technical: toNumber(i.technical),
          communication: toNumber(i.communication),
          professionalism: toNumber(i.professionalism),
        })),
      };
    }
    case "personnel": {
      const items = await prisma.developer.findMany({
        where: scope,
        include: { user: { select: { name: true, email: true } } },
        orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
      });
      return {
        columns: [
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "jobTitle", label: "Title" },
          { key: "hourlyRate", label: "Hourly rate" },
          { key: "capacity", label: "Weekly capacity" },
          { key: "jiraAccount", label: "Jira account" },
          { key: "status", label: "Status" },
          { key: "skills", label: "Skills" },
        ],
        rows: items.map((i) => ({
          name: i.user.name,
          email: i.user.email,
          jobTitle: i.jobTitle,
          hourlyRate: toNumber(i.hourlyRate),
          capacity: toNumber(i.standardCapacity),
          jiraAccount: i.jiraAccountEmail ?? "",
          status: i.isActive ? "Active" : "Inactive",
          skills: i.skillTags.join(", "),
        })),
      };
    }
    default:
      return { columns: [], rows: [] };
  }
}

function rowsToSheetAoA(
  columns: ReportColumn[],
  rows: Record<string, string | number | null>[]
): (string | number)[][] {
  const header = columns.map((c) => c.label);
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined) return "";
      return v;
    })
  );
  return [header, ...body];
}

function workbookToBase64(workbook: XLSX.WorkBook): string {
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;
  return Buffer.from(buffer).toString("base64");
}

export async function getReport(
  input: ReportQueryInput
): Promise<ActionResult<ReportResult>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const perms = reportPerms(session.user.role);
    if (!perms.canView) return fail("Unauthorized");

    const parsed = reportQuerySchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid report query");
    }

    const { type, from, to } = parsed.data;
    const built = await buildReportRows(session, type, from, to);

    return ok({
      type,
      label: REPORT_TYPE_LABELS[type],
      from: isoDate(from),
      to: isoDate(to),
      columns: built.columns,
      rows: built.rows,
      permissions: perms,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load report";
    return fail(message);
  }
}

export async function exportReportExcel(
  input: ReportQueryInput
): Promise<ActionResult<{ filename: string; base64: string }>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const perms = reportPerms(session.user.role);
    if (!perms.canExport) return fail("Unauthorized to export");

    const parsed = reportQuerySchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid report query");
    }

    const { type, from, to } = parsed.data;
    const built = await buildReportRows(session, type, from, to);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(
      rowsToSheetAoA(built.columns, built.rows)
    );
    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      REPORT_TYPE_LABELS[type].slice(0, 31)
    );

    const fromLabel = isoDate(from);
    const toLabel = isoDate(to);
    const filename = `report-${type}-${fromLabel}-to-${toLabel}.xlsx`;

    return ok({
      filename,
      base64: workbookToBase64(workbook),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export Excel";
    return fail(message);
  }
}

export async function exportAllReportsExcel(input: {
  from: Date;
  to: Date;
}): Promise<ActionResult<{ filename: string; base64: string }>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);

    const from = dayStart(input.from);
    const to = dayEnd(input.to);
    if (to < from) return fail("End date must be on or after start date");

    const workbook = XLSX.utils.book_new();
    const types: ReportType[] = [
      "timesheets",
      "projects",
      "leave",
      "overtime",
      "evaluations",
      "personnel",
    ];

    for (const type of types) {
      const built = await buildReportRows(session, type, from, to);
      const sheet = XLSX.utils.aoa_to_sheet(
        rowsToSheetAoA(built.columns, built.rows)
      );
      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        REPORT_TYPE_LABELS[type].slice(0, 31)
      );
    }

    const filename = `governance-reports-${isoDate(from)}-to-${isoDate(to)}.xlsx`;
    return ok({
      filename,
      base64: workbookToBase64(workbook),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export Excel pack";
    return fail(message);
  }
}
