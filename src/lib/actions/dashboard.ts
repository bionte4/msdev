"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import {
  MAX_WEEKLY_HOURS_HARD_CAP,
  WEEKLY_HOURS_WARNING,
} from "@/lib/constants";
import { getWeekBounds, toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface DashboardKpi {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
  href?: string;
}

export interface DashboardAttentionItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "warning" | "danger" | "info";
}

export interface DashboardQuickLink {
  href: string;
  label: string;
  description: string;
}

export interface HomeDashboardData {
  greetingName: string;
  role: string;
  weekLabel: string;
  engagementMode: string | null;
  kpis: DashboardKpi[];
  attention: DashboardAttentionItem[];
  quickLinks: DashboardQuickLink[];
}

function clientWhere(session: {
  user: { role: string; clientId?: string | null };
}) {
  if (session.user.role === "SYS_ADMIN") return {};
  if (session.user.clientId) return { clientId: session.user.clientId };
  return { clientId: "__none__" };
}

function developerClientWhere(session: {
  user: { role: string; clientId?: string | null };
}) {
  if (session.user.role === "SYS_ADMIN") return {};
  if (session.user.clientId) return { clientId: session.user.clientId };
  return { clientId: "__none__" };
}

export async function getHomeDashboard(): Promise<
  ActionResult<HomeDashboardData>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const { weekStart, weekEnd } = getWeekBounds(new Date());
    const weekLabel = `${weekStart.toISOString().slice(0, 10)} → ${weekEnd
      .toISOString()
      .slice(0, 10)}`;

    const role = session.user.role;
    const isDeveloper = role === "DEVELOPER";
    const clientFilter = clientWhere(session);
    const developerFilter = developerClientWhere(session);

    let engagementMode: string | null = session.user.engagementMode ?? null;
    if (!engagementMode && session.user.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: session.user.clientId },
        select: { engagementMode: true },
      });
      engagementMode = client?.engagementMode ?? null;
    }

    if (isDeveloper) {
      const developerId = session.user.developerId;
      if (!developerId) {
        return fail("Developer profile is not linked to this account");
      }

      const [timesheets, leavePending, otPending, coverages, skills] =
        await Promise.all([
          prisma.timesheet.findMany({
            where: {
              developerId,
              workDate: { gte: weekStart, lte: weekEnd },
            },
          }),
          prisma.leaveRequest.count({
            where: { developerId, status: "PENDING" },
          }),
          prisma.overtimeRequest.count({
            where: { developerId, status: "PENDING" },
          }),
          prisma.coverageAssignment.count({
            where: {
              status: { in: ["PLANNED", "ACTIVE"] },
              OR: [
                { absentDeveloperId: developerId },
                { coverDeveloperId: developerId },
              ],
            },
          }),
          prisma.developerSkill.count({ where: { developerId } }),
        ]);

      const loggedHours = timesheets.reduce(
        (sum, t) => sum + toNumber(t.hours),
        0
      );
      const otHours = timesheets
        .filter((t) => t.isOvertime)
        .reduce((sum, t) => sum + toNumber(t.hours), 0);

      let hoursTone: DashboardKpi["tone"] = "success";
      if (loggedHours >= MAX_WEEKLY_HOURS_HARD_CAP) hoursTone = "danger";
      else if (loggedHours >= WEEKLY_HOURS_WARNING) hoursTone = "warning";

      const attention: DashboardAttentionItem[] = [];
      if (leavePending > 0) {
        attention.push({
          id: "leave-pending",
          title: `${leavePending} leave request pending`,
          detail: "Waiting for reviewer decision",
          href: "/personnel",
          tone: "warning",
        });
      }
      if (otPending > 0) {
        attention.push({
          id: "ot-pending",
          title: `${otPending} overtime request pending`,
          detail: "Awaiting client approval",
          href: "/overtime",
          tone: "warning",
        });
      }
      if (coverages > 0) {
        attention.push({
          id: "coverage",
          title: `${coverages} active/planned coverage`,
          detail: "You are absent or covering someone",
          href: "/coverage",
          tone: "info",
        });
      }
      if (loggedHours >= WEEKLY_HOURS_WARNING) {
        attention.push({
          id: "hours-risk",
          title: "Weekly hours near / over cap",
          detail: `${loggedHours.toFixed(1)}h logged · warning ${WEEKLY_HOURS_WARNING}h · hard cap ${MAX_WEEKLY_HOURS_HARD_CAP}h`,
          href: "/timesheets",
          tone: loggedHours >= MAX_WEEKLY_HOURS_HARD_CAP ? "danger" : "warning",
        });
      }

      return ok({
        greetingName: session.user.name ?? "Developer",
        role,
        weekLabel,
        engagementMode,
        kpis: [
          {
            key: "hours",
            label: "Hours this week",
            value: loggedHours.toFixed(1),
            hint: `OT ${otHours.toFixed(1)}h · cap ${MAX_WEEKLY_HOURS_HARD_CAP}h`,
            tone: hoursTone,
            href: "/timesheets",
          },
          {
            key: "leave",
            label: "Pending leave",
            value: String(leavePending),
            href: "/personnel",
            tone: leavePending > 0 ? "warning" : "default",
          },
          {
            key: "ot",
            label: "Pending overtime",
            value: String(otPending),
            href: "/overtime",
            tone: otPending > 0 ? "warning" : "default",
          },
          {
            key: "skills",
            label: "Skills assigned",
            value: String(skills),
            href: "/development",
          },
        ],
        attention,
        quickLinks: [
          {
            href: "/timesheets",
            label: "Timesheets",
            description: "Log daily hours",
          },
          {
            href: "/overtime",
            label: "Overtime",
            description: "Request client pre-approval",
          },
          {
            href: "/personnel",
            label: "Leave",
            description: "Submit cuti / sakit",
          },
          {
            href: "/development",
            label: "Development",
            description: "Skills & training",
          },
        ],
      });
    }

    const [
      activeDevelopers,
      activeProjects,
      pendingLeave,
      pendingOt,
      openReplacements,
      activeCoverage,
      timesheetsWeek,
    ] = await Promise.all([
      prisma.developer.count({
        where: { isActive: true, ...developerFilter },
      }),
      prisma.project.count({
        where: { isActive: true, ...clientFilter },
      }),
      prisma.leaveRequest.count({
        where: {
          status: "PENDING",
          developer: developerFilter,
        },
      }),
      prisma.overtimeRequest.count({
        where: {
          status: "PENDING",
          developer: developerFilter,
        },
      }),
      prisma.replacementTicket.count({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          ...clientFilter,
        },
      }),
      prisma.coverageAssignment.count({
        where: {
          status: { in: ["PLANNED", "ACTIVE"] },
          ...clientFilter,
        },
      }),
      prisma.timesheet.findMany({
        where: {
          workDate: { gte: weekStart, lte: weekEnd },
          developer: developerFilter,
        },
        select: { hours: true, developerId: true },
      }),
    ]);

    const hoursByDev = new Map<string, number>();
    let totalHours = 0;
    for (const row of timesheetsWeek) {
      const h = toNumber(row.hours);
      totalHours += h;
      hoursByDev.set(
        row.developerId,
        (hoursByDev.get(row.developerId) ?? 0) + h
      );
    }
    let nearCap = 0;
    let overCap = 0;
    for (const h of Array.from(hoursByDev.values())) {
      if (h >= MAX_WEEKLY_HOURS_HARD_CAP) overCap += 1;
      else if (h >= WEEKLY_HOURS_WARNING) nearCap += 1;
    }

    const attention: DashboardAttentionItem[] = [];
    if (pendingLeave > 0) {
      attention.push({
        id: "leave",
        title: `${pendingLeave} leave awaiting review`,
        detail: "Approve or reject in Personnel",
        href: "/personnel",
        tone: "warning",
      });
    }
    if (pendingOt > 0) {
      attention.push({
        id: "ot",
        title: `${pendingOt} overtime awaiting client decision`,
        detail: "Review in Overtime",
        href: "/overtime",
        tone: "warning",
      });
    }
    if (openReplacements > 0) {
      attention.push({
        id: "sla",
        title: `${openReplacements} open replacement tickets`,
        detail: "SLA target 10 working days · score < 2.80",
        href: "/evaluations",
        tone: "danger",
      });
    }
    if (overCap + nearCap > 0) {
      attention.push({
        id: "capacity",
        title: `${nearCap} near cap · ${overCap} over hard cap`,
        detail: `Week ${weekLabel}`,
        href: "/capacity",
        tone: overCap > 0 ? "danger" : "warning",
      });
    }
    if (activeCoverage > 0) {
      attention.push({
        id: "coverage",
        title: `${activeCoverage} coverage assignments active/planned`,
        detail: "Leave coverage roster",
        href: "/coverage",
        tone: "info",
      });
    }

    const quickLinks: DashboardQuickLink[] = [
      {
        href: "/capacity",
        label: "Capacity",
        description: "Weekly utilization",
      },
      {
        href: "/timesheets",
        label: "Timesheets",
        description: "Team hours",
      },
      {
        href: "/evaluations",
        label: "Evaluations",
        description: "Monthly scorecards",
      },
      {
        href: "/reports",
        label: "Reports",
        description: "Export Excel",
      },
    ];

    if (role === "SYS_ADMIN" || role === "VENDOR_LEAD") {
      quickLinks.push({
        href: "/access",
        label: "User access",
        description: "Roles & activation",
      });
    }

    return ok({
      greetingName: session.user.name ?? "there",
      role,
      weekLabel,
      engagementMode,
      kpis: [
        {
          key: "devs",
          label: "Active developers",
          value: String(activeDevelopers),
          href: "/personnel",
        },
        {
          key: "projects",
          label: "Active projects",
          value: String(activeProjects),
          href: "/projects",
        },
        {
          key: "hours",
          label: "Hours this week",
          value: totalHours.toFixed(1),
          hint: `${nearCap} warn · ${overCap} over cap`,
          tone: overCap > 0 ? "danger" : nearCap > 0 ? "warning" : "default",
          href: "/capacity",
        },
        {
          key: "queue",
          label: "Pending leave / OT",
          value: `${pendingLeave} / ${pendingOt}`,
          tone:
            pendingLeave + pendingOt > 0 ? "warning" : "default",
          href: "/personnel",
        },
        {
          key: "sla",
          label: "Open replacements",
          value: String(openReplacements),
          tone: openReplacements > 0 ? "danger" : "success",
          href: "/evaluations",
        },
        {
          key: "coverage",
          label: "Active coverage",
          value: String(activeCoverage),
          href: "/coverage",
        },
      ],
      attention,
      quickLinks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load dashboard";
    return fail(message);
  }
}
