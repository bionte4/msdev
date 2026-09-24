import { z } from "zod";
import {
  MAX_DAILY_HOURS,
  MAX_WEEKLY_HOURS_HARD_CAP,
} from "@/lib/constants";

export const timesheetFieldsSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  workDate: z.coerce.date({ message: "Work date is required" }),
  hours: z.coerce
    .number()
    .positive("Hours must be greater than 0")
    .max(MAX_DAILY_HOURS, `Maximum ${MAX_DAILY_HOURS} hours per day`),
  taskSummary: z
    .string()
    .min(5, "Task summary must be at least 5 characters")
    .max(500, "Task summary must be at most 500 characters"),
  isOvertime: z.boolean().default(false),
  developerId: z.string().optional(),
});

export const createTimesheetSchema = timesheetFieldsSchema;

export const updateTimesheetSchema = timesheetFieldsSchema.extend({
  id: z.string().min(1, "Timesheet ID is required"),
});

export const deleteTimesheetSchema = z.object({
  id: z.string().min(1, "Timesheet ID is required"),
});

export const listTimesheetsSchema = z
  .object({
    weekStart: z.coerce.date().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    developerId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.to < data.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "End date must be on or after start date",
      });
    }
    if (data.from && data.to) {
      const span = data.to.getTime() - data.from.getTime();
      const max = 92 * 24 * 60 * 60 * 1000;
      if (span > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to"],
          message: "Date range cannot exceed 92 days",
        });
      }
    }
  });

export const bulkImportTimesheetRowSchema = z.object({
  workDate: z.coerce.date({ message: "workDate is required (YYYY-MM-DD)" }),
  developerEmail: z.string().email("developerEmail must be a valid email"),
  projectCode: z
    .string()
    .min(1, "projectCode is required")
    .transform((v) => v.trim().toUpperCase()),
  hours: z.coerce
    .number()
    .positive("hours must be > 0")
    .max(MAX_DAILY_HOURS, `hours max ${MAX_DAILY_HOURS}`),
  taskSummary: z.string().min(5).max(500),
  isOvertime: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v === 1;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        return s === "yes" || s === "true" || s === "1" || s === "y";
      }
      return false;
    }),
});

export const bulkImportTimesheetsSchema = z.object({
  rows: z
    .array(bulkImportTimesheetRowSchema)
    .min(1, "At least one row is required")
    .max(200, "Maximum 200 rows per import"),
});

export type CreateTimesheetInput = z.infer<typeof createTimesheetSchema>;
export type UpdateTimesheetInput = z.infer<typeof updateTimesheetSchema>;
export type DeleteTimesheetInput = z.infer<typeof deleteTimesheetSchema>;
export type ListTimesheetsInput = z.infer<typeof listTimesheetsSchema>;
export type BulkImportTimesheetsInput = z.infer<
  typeof bulkImportTimesheetsSchema
>;

export const CAP_MESSAGES = {
  daily: `Daily hard cap of ${MAX_DAILY_HOURS} hours exceeded.`,
  weekly: `Weekly hard cap of ${MAX_WEEKLY_HOURS_HARD_CAP} hours exceeded.`,
} as const;

export const TIMESHEET_IMPORT_HEADERS = [
  "workDate",
  "developerEmail",
  "projectCode",
  "hours",
  "taskSummary",
  "isOvertime",
] as const;
