"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import {
  MAX_WEEKLY_HOURS_HARD_CAP,
  WEEKLY_HOURS_WARNING,
} from "@/lib/constants";
import type { DeveloperCapacityRow } from "@/lib/validations/capacity";
import { getWeekBounds, toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface CapacityDashboardData {
  weekStart: string;
  weekEnd: string;
  warningThreshold: number;
  hardCap: number;
  totals: {
    developers: number;
    totalLoggedHours: number;
    nearCapCount: number;
    overCapCount: number;
    averageUtilization: number;
  };
  rows: DeveloperCapacityRow[];
}

function resolveStatus(
  loggedHours: number
): DeveloperCapacityRow["status"] {
  if (loggedHours >= MAX_WEEKLY_HOURS_HARD_CAP) return "over_cap";
  if (loggedHours >= WEEKLY_HOURS_WARNING) return "critical";
  if (loggedHours >= WEEKLY_HOURS_WARNING - 5) return "warning";
  return "ok";
}

export async function getWeeklyCapacityDashboard(
  weekStartInput?: Date,
  clientIdFilter?: string
): Promise<ActionResult<CapacityDashboardData>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);

    const { weekStart, weekEnd } = getWeekBounds(weekStartInput ?? new Date());

    const clientId =
      session.user.role === "SYS_ADMIN"
        ? clientIdFilter
        : session.user.clientId ?? undefined;

    if (!clientId && session.user.role !== "SYS_ADMIN") {
      return fail("Client context is required");
    }

    const developers = await prisma.developer.findMany({
      where: {
        isActive: true,
        ...(clientId ? { clientId } : {}),
      },
      include: {
        user: { select: { name: true, email: true } },
        timesheets: {
          where: {
            workDate: { gte: weekStart, lte: weekEnd },
          },
        },
      },
      orderBy: { user: { name: "asc" } },
    });

    const rows: DeveloperCapacityRow[] = developers.map((dev) => {
      const loggedHours = dev.timesheets.reduce(
        (sum, t) => sum + toNumber(t.hours),
        0
      );
      const overtimeHours = dev.timesheets
        .filter((t) => t.isOvertime)
        .reduce((sum, t) => sum + toNumber(t.hours), 0);
      const standardCapacity = toNumber(dev.standardCapacity);
      const utilizationPercent =
        standardCapacity > 0
          ? Math.round((loggedHours / standardCapacity) * 100)
          : 0;

      return {
        developerId: dev.id,
        developerName: dev.user.name,
        email: dev.user.email,
        standardCapacity,
        loggedHours,
        overtimeHours,
        utilizationPercent,
        status: resolveStatus(loggedHours),
      };
    });

    const totalLoggedHours = rows.reduce((s, r) => s + r.loggedHours, 0);
    const nearCapCount = rows.filter(
      (r) => r.status === "warning" || r.status === "critical"
    ).length;
    const overCapCount = rows.filter((r) => r.status === "over_cap").length;
    const averageUtilization =
      rows.length > 0
        ? Math.round(
            rows.reduce((s, r) => s + r.utilizationPercent, 0) / rows.length
          )
        : 0;

    return ok({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      warningThreshold: WEEKLY_HOURS_WARNING,
      hardCap: MAX_WEEKLY_HOURS_HARD_CAP,
      totals: {
        developers: rows.length,
        totalLoggedHours,
        nearCapCount,
        overCapCount,
        averageUtilization,
      },
      rows,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load capacity dashboard";
    return fail(message);
  }
}
