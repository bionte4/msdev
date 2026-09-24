"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { EVALUATION_REPLACEMENT_THRESHOLD } from "@/lib/constants";
import {
  LEADERBOARD_METRIC_LABELS,
  leaderboardQuerySchema,
  type LeaderboardMetric,
  type LeaderboardQueryInput,
} from "@/lib/validations/leaderboard";
import { toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface LeaderboardRow {
  rank: number;
  developerId: string;
  developerName: string;
  jobTitle: string;
  email: string;
  value: number;
  secondaryLabel: string;
  secondaryValue: string;
  badge: "top" | "good" | "watch" | "neutral";
  isCurrentUser: boolean;
}

export interface LeaderboardData {
  metric: LeaderboardMetric;
  metricLabel: string;
  year: number;
  month: number;
  periodLabel: string;
  replacementThreshold: number;
  rows: LeaderboardRow[];
  podium: LeaderboardRow[];
}

function monthBounds(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(year, month - 1, 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(year, month, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function clientScope(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>
): Record<string, unknown> {
  if (session.user.role === "SYS_ADMIN") return {};
  if (session.user.clientId) return { clientId: session.user.clientId };
  return { clientId: "__none__" };
}

export async function getLeaderboard(
  input: LeaderboardQueryInput
): Promise<ActionResult<LeaderboardData>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const parsed = leaderboardQuerySchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid leaderboard query");
    }

    const { metric, year, month } = parsed.data;
    const scope = clientScope(session);
    const { from, to } = monthBounds(year, month);
    const periodLabel = `${String(month).padStart(2, "0")}/${year}`;

    const developers = await prisma.developer.findMany({
      where: { isActive: true, ...scope },
      include: {
        user: { select: { name: true, email: true } },
        evaluations: {
          where: { year, month },
          take: 1,
        },
        performanceActions: {
          where: { actionDate: { gte: from, lte: to } },
        },
        timesheets: {
          where: { workDate: { gte: from, lte: to } },
        },
        developerSkills: {
          include: { skill: true },
        },
      },
      orderBy: { user: { name: "asc" } },
    });

    type RankCandidate = {
      developerId: string;
      developerName: string;
      jobTitle: string;
      email: string;
      value: number;
      secondaryLabel: string;
      secondaryValue: string;
      badge: LeaderboardRow["badge"];
      isCurrentUser: boolean;
    };

    const candidates: RankCandidate[] = developers.map((dev) => {
      const evalRow = dev.evaluations[0];
      const evalScore = evalRow ? toNumber(evalRow.totalScore) : null;
      const rewardPoints = dev.performanceActions.reduce(
        (sum, a) => sum + a.points,
        0
      );
      const hours = dev.timesheets.reduce(
        (sum, t) => sum + toNumber(t.hours),
        0
      );
      const skillCount = dev.developerSkills.length;
      const isCurrentUser = session.user.developerId === dev.id;

      if (metric === "evaluation") {
        const value = evalScore ?? 0;
        let badge: LeaderboardRow["badge"] = "neutral";
        if (evalScore !== null) {
          if (evalScore >= 4) badge = "top";
          else if (evalScore >= 3.2) badge = "good";
          else if (evalScore < EVALUATION_REPLACEMENT_THRESHOLD) badge = "watch";
          else badge = "neutral";
        }
        return {
          developerId: dev.id,
          developerName: dev.user.name,
          jobTitle: dev.jobTitle,
          email: dev.user.email,
          value,
          secondaryLabel: "Hours",
          secondaryValue: `${hours.toFixed(1)}h · ${skillCount} skills`,
          badge: evalScore === null ? "neutral" : badge,
          isCurrentUser,
        };
      }

      if (metric === "rewards") {
        return {
          developerId: dev.id,
          developerName: dev.user.name,
          jobTitle: dev.jobTitle,
          email: dev.user.email,
          value: rewardPoints,
          secondaryLabel: "Eval",
          secondaryValue:
            evalScore !== null
              ? `Score ${evalScore.toFixed(2)}`
              : "No evaluation",
          badge:
            rewardPoints >= 10
              ? "top"
              : rewardPoints > 0
                ? "good"
                : rewardPoints < 0
                  ? "watch"
                  : "neutral",
          isCurrentUser,
        };
      }

      return {
        developerId: dev.id,
        developerName: dev.user.name,
        jobTitle: dev.jobTitle,
        email: dev.user.email,
        value: Number(hours.toFixed(1)),
        secondaryLabel: "Eval / points",
        secondaryValue: `${evalScore !== null ? evalScore.toFixed(2) : "—"} · ${rewardPoints >= 0 ? "+" : ""}${rewardPoints} pts`,
        badge:
          hours >= 140
            ? "top"
            : hours >= 80
              ? "good"
              : hours > 0
                ? "neutral"
                : "watch",
        isCurrentUser,
      };
    });

    const ranked = candidates
      .filter((c) => {
        if (metric === "evaluation") {
          const hasEval = developers.find((d) => d.id === c.developerId)
            ?.evaluations.length;
          return Boolean(hasEval) || c.value > 0;
        }
        return true;
      })
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.developerName.localeCompare(b.developerName);
      })
      .map((c, idx) => ({ ...c, rank: idx + 1 }));

    // If evaluation metric and nobody has evals, still show roster ranked by name with 0
    const rows =
      ranked.length > 0
        ? ranked
        : candidates
            .sort((a, b) => a.developerName.localeCompare(b.developerName))
            .map((c, idx) => ({ ...c, rank: idx + 1 }));

    return ok({
      metric,
      metricLabel: LEADERBOARD_METRIC_LABELS[metric],
      year,
      month,
      periodLabel,
      replacementThreshold: EVALUATION_REPLACEMENT_THRESHOLD,
      rows,
      podium: rows.slice(0, 3),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load leaderboard";
    return fail(message);
  }
}
