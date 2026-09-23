import { z } from "zod";

export const leaveTypes = [
  "ANNUAL_LEAVE",
  "SICK",
  "UNPAID",
  "OTHER",
] as const;

export const createLeaveRequestSchema = z
  .object({
    developerId: z.string().optional(),
    leaveType: z.enum(leaveTypes),
    startDate: z.coerce.date({ message: "Start date is required" }),
    endDate: z.coerce.date({ message: "End date is required" }),
    reason: z
      .string()
      .min(5, "Reason must be at least 5 characters")
      .max(1000),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export const updateLeaveRequestSchema = z
  .object({
    id: z.string().min(1),
    leaveType: z.enum(leaveTypes),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(5).max(1000),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export const reviewLeaveRequestSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(1000).optional(),
});

export const cancelLeaveRequestSchema = z.object({
  id: z.string().min(1),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type UpdateLeaveRequestInput = z.infer<typeof updateLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;
export type CancelLeaveRequestInput = z.infer<typeof cancelLeaveRequestSchema>;

export function countLeaveDays(start: Date, end: Date): number {
  const s = new Date(start);
  const e = new Date(end);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}
