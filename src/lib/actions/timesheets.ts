"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import {
  MAX_DAILY_HOURS,
  MAX_WEEKLY_HOURS_HARD_CAP,
  WEEKLY_HOURS_WARNING,
} from "@/lib/constants";
import {
  CAP_MESSAGES,
  createTimesheetSchema,
  type CreateTimesheetInput,
} from "@/lib/validations/timesheet";
import { getWeekBounds, toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface TimesheetEntry {
  id: string;
  projectId: string;
  projectName: string;
  workDate: string;
  hours: number;
  taskSummary: string;
  isOvertime: boolean;
}

export interface WeeklyTimesheetSummary {
  weekStart: string;
  weekEnd: string;
  totalHours: number;
  overtimeHours: number;
  remainingToHardCap: number;
  warningThreshold: number;
  hardCap: number;
  isNearCap: boolean;
  isOverCap: boolean;
  entries: TimesheetEntry[];
}

export async function createTimesheet(
  input: CreateTimesheetInput
): Promise<ActionResult<TimesheetEntry>> {
  try {
    const session = await auth();
    assertRole(session, [
      "DEVELOPER",
      "VENDOR_LEAD",
      "SYS_ADMIN",
    ]);

    const parsed = createTimesheetSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid timesheet data");
    }

    const developerId = session.user.developerId;
    if (!developerId && session.user.role === "DEVELOPER") {
      return fail("Developer profile not found for current user");
    }

    if (!developerId) {
      return fail("Developer ID is required to submit a timesheet");
    }

    const data = parsed.data;
    const workDate = new Date(data.workDate);
    workDate.setHours(0, 0, 0, 0);

    const dayEnd = new Date(workDate);
    dayEnd.setHours(23, 59, 59, 999);

    const existingDay = await prisma.timesheet.aggregate({
      where: {
        developerId,
        workDate: { gte: workDate, lte: dayEnd },
      },
      _sum: { hours: true },
    });

    const dayTotal =
      toNumber(existingDay._sum.hours ?? 0) + data.hours;
    if (dayTotal > MAX_DAILY_HOURS) {
      return fail(
        `${CAP_MESSAGES.daily} Current day total would be ${dayTotal.toFixed(1)}h.`
      );
    }

    const { weekStart, weekEnd } = getWeekBounds(workDate);
    const existingWeek = await prisma.timesheet.aggregate({
      where: {
        developerId,
        workDate: { gte: weekStart, lte: weekEnd },
      },
      _sum: { hours: true },
    });

    const weekTotal =
      toNumber(existingWeek._sum.hours ?? 0) + data.hours;
    if (weekTotal > MAX_WEEKLY_HOURS_HARD_CAP) {
      return fail(
        `${CAP_MESSAGES.weekly} Current week total would be ${weekTotal.toFixed(1)}h.`
      );
    }

    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        isActive: true,
      },
    });

    if (!project) {
      return fail("Project not found or inactive");
    }

    const entry = await prisma.timesheet.create({
      data: {
        developerId,
        projectId: data.projectId,
        workDate,
        hours: data.hours,
        taskSummary: data.taskSummary,
        isOvertime: data.isOvertime || data.hours > 8,
      },
      include: { project: true },
    });

    return ok({
      id: entry.id,
      projectId: entry.projectId,
      projectName: entry.project.name,
      workDate: entry.workDate.toISOString().slice(0, 10),
      hours: toNumber(entry.hours),
      taskSummary: entry.taskSummary,
      isOvertime: entry.isOvertime,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create timesheet";
    return fail(message);
  }
}

export async function getWeeklyTimesheetSummary(
  weekStartInput?: Date
): Promise<ActionResult<WeeklyTimesheetSummary>> {
  try {
    const session = await auth();
    assertRole(session, [
      "DEVELOPER",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "CLIENT_PM",
      "SYS_ADMIN",
    ]);

    const developerId = session.user.developerId;
    if (!developerId) {
      return fail("Developer profile not found");
    }

    const { weekStart, weekEnd } = getWeekBounds(weekStartInput ?? new Date());

    const entries = await prisma.timesheet.findMany({
      where: {
        developerId,
        workDate: { gte: weekStart, lte: weekEnd },
      },
      include: { project: true },
      orderBy: { workDate: "asc" },
    });

    const totalHours = entries.reduce(
      (sum, e) => sum + toNumber(e.hours),
      0
    );
    const overtimeHours = entries
      .filter((e) => e.isOvertime)
      .reduce((sum, e) => sum + toNumber(e.hours), 0);

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
      entries: entries.map((e) => ({
        id: e.id,
        projectId: e.projectId,
        projectName: e.project.name,
        workDate: e.workDate.toISOString().slice(0, 10),
        hours: toNumber(e.hours),
        taskSummary: e.taskSummary,
        isOvertime: e.isOvertime,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load timesheet summary";
    return fail(message);
  }
}

export async function getActiveProjectsForTimesheet(): Promise<
  ActionResult<{ id: string; name: string; code: string }[]>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "DEVELOPER",
      "VENDOR_LEAD",
      "SYS_ADMIN",
    ]);

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
