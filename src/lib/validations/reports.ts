import { z } from "zod";

export const reportTypes = [
  "timesheets",
  "projects",
  "leave",
  "overtime",
  "evaluations",
  "personnel",
  "tickets",
] as const;

export type ReportType = (typeof reportTypes)[number];

export const reportQuerySchema = z.object({
  type: z.enum(reportTypes),
  from: z.coerce.date(),
  to: z.coerce.date(),
}).superRefine((data, ctx) => {
  if (data.to < data.from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "End date must be on or after start date",
    });
  }
  const spanMs = data.to.getTime() - data.from.getTime();
  const maxSpan = 366 * 24 * 60 * 60 * 1000;
  if (spanMs > maxSpan) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "Date range cannot exceed 366 days",
    });
  }
});

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  timesheets: "Timesheets",
  projects: "Project hours",
  leave: "Leave requests",
  overtime: "Overtime",
  evaluations: "Evaluations",
  personnel: "Personnel roster",
  tickets: "Operational tickets",
};
