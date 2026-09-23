import { z } from "zod";
import { MAX_DAILY_HOURS } from "@/lib/constants";

export const createOvertimeRequestSchema = z.object({
  workDate: z.coerce.date({ message: "Work date is required" }),
  requestedHours: z.coerce
    .number()
    .positive("Requested hours must be greater than 0")
    .max(
      MAX_DAILY_HOURS,
      `Overtime request cannot exceed ${MAX_DAILY_HOURS} hours in a day`
    ),
  reason: z
    .string()
    .min(10, "Reason must be at least 10 characters")
    .max(1000, "Reason must be at most 1000 characters"),
});

export type CreateOvertimeRequestInput = z.infer<
  typeof createOvertimeRequestSchema
>;

export const reviewOvertimeRequestSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
  decision: z.enum(["APPROVED_CLIENT", "REJECTED_CLIENT"]),
  reviewNote: z.string().max(1000).optional(),
});

export type ReviewOvertimeRequestInput = z.infer<
  typeof reviewOvertimeRequestSchema
>;
