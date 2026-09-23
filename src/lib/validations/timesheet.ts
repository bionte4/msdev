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

export const listTimesheetsSchema = z.object({
  weekStart: z.coerce.date().optional(),
  developerId: z.string().optional(),
});

export type CreateTimesheetInput = z.infer<typeof createTimesheetSchema>;
export type UpdateTimesheetInput = z.infer<typeof updateTimesheetSchema>;
export type DeleteTimesheetInput = z.infer<typeof deleteTimesheetSchema>;
export type ListTimesheetsInput = z.infer<typeof listTimesheetsSchema>;

export const CAP_MESSAGES = {
  daily: `Daily hard cap of ${MAX_DAILY_HOURS} hours exceeded.`,
  weekly: `Weekly hard cap of ${MAX_WEEKLY_HOURS_HARD_CAP} hours exceeded.`,
} as const;
