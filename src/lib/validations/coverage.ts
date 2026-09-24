import { z } from "zod";

export const coverageStatuses = [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export const createCoverageSchema = z
  .object({
    projectId: z.string().min(1, "Project is required"),
    absentDeveloperId: z.string().min(1, "Absent developer is required"),
    coverDeveloperId: z.string().min(1, "Cover developer is required"),
    leaveRequestId: z.string().optional().nullable(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(5).max(1000),
    notes: z.string().max(1000).optional().nullable(),
    status: z.enum(coverageStatuses).default("PLANNED"),
  })
  .superRefine((data, ctx) => {
    if (data.absentDeveloperId === data.coverDeveloperId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverDeveloperId"],
        message: "Cover developer must be different from absent developer",
      });
    }
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after start date",
      });
    }
  });

export const updateCoverageSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    absentDeveloperId: z.string().min(1),
    coverDeveloperId: z.string().min(1),
    leaveRequestId: z.string().optional().nullable(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(5).max(1000),
    notes: z.string().max(1000).optional().nullable(),
    status: z.enum(coverageStatuses),
  })
  .superRefine((data, ctx) => {
    if (data.absentDeveloperId === data.coverDeveloperId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverDeveloperId"],
        message: "Cover developer must be different from absent developer",
      });
    }
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after start date",
      });
    }
  });

export const cancelCoverageSchema = z.object({
  id: z.string().min(1),
});

export type CreateCoverageInput = z.infer<typeof createCoverageSchema>;
export type UpdateCoverageInput = z.infer<typeof updateCoverageSchema>;
export type CancelCoverageInput = z.infer<typeof cancelCoverageSchema>;
