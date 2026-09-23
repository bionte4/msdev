import { z } from "zod";

export const trainingStatuses = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export const coachingStatuses = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const upsertTrainingSchema = z
  .object({
    id: z.string().optional(),
    developerId: z.string().min(1),
    title: z.string().min(3).max(160),
    provider: z.string().min(2).max(120),
    status: z.enum(trainingStatuses).default("PLANNED"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional().nullable(),
    hours: z.coerce.number().positive().max(500),
    skillFocus: z.string().max(120).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    location: z.string().max(200).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after start date",
      });
    }
  });

export const deleteTrainingSchema = z.object({
  id: z.string().min(1),
});

export const upsertCoachingSchema = z.object({
  id: z.string().optional(),
  developerId: z.string().min(1),
  coachName: z.string().min(2).max(120),
  topic: z.string().min(3).max(160),
  status: z.enum(coachingStatuses).default("SCHEDULED"),
  sessionDate: z.coerce.date(),
  durationMin: z.coerce.number().int().min(15).max(480).default(60),
  outcome: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
});

export const deleteCoachingSchema = z.object({
  id: z.string().min(1),
});

export const upsertPerformanceActionSchema = z.object({
  id: z.string().optional(),
  developerId: z.string().min(1),
  actionType: z.enum(["REWARD", "PUNISHMENT"]),
  title: z.string().min(3).max(160),
  reason: z.string().min(5).max(1000),
  points: z.coerce.number().int().min(-100).max(100),
  actionDate: z.coerce.date(),
  notes: z.string().max(1000).optional(),
});

export const deletePerformanceActionSchema = z.object({
  id: z.string().min(1),
});

export type UpsertTrainingInput = z.infer<typeof upsertTrainingSchema>;
export type UpsertCoachingInput = z.infer<typeof upsertCoachingSchema>;
export type UpsertPerformanceActionInput = z.infer<
  typeof upsertPerformanceActionSchema
>;
