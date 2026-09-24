import { z } from "zod";

export const leaderboardMetrics = [
  "evaluation",
  "rewards",
  "hours",
] as const;

export type LeaderboardMetric = (typeof leaderboardMetrics)[number];

export const LEADERBOARD_METRIC_LABELS: Record<LeaderboardMetric, string> = {
  evaluation: "Evaluation score",
  rewards: "Reward points",
  hours: "Logged hours",
};

export const leaderboardQuerySchema = z.object({
  metric: z.enum(leaderboardMetrics).default("evaluation"),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type LeaderboardQueryInput = z.infer<typeof leaderboardQuerySchema>;
