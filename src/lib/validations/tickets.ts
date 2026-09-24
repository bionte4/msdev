import { z } from "zod";

export const ticketWorkCategories = [
  "DEVELOPMENT",
  "MANAGE_APPS",
  "MANAGE_DEVICE",
  "SUPPORT",
  "ACCESS",
  "OTHER",
] as const;

export const ticketStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
] as const;

export type TicketWorkCategory = (typeof ticketWorkCategories)[number];
export type TicketStatus = (typeof ticketStatuses)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketWorkCategory, string> = {
  DEVELOPMENT: "Development",
  MANAGE_APPS: "Manage apps",
  MANAGE_DEVICE: "Manage device",
  SUPPORT: "Support",
  ACCESS: "Access",
  OTHER: "Other",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const ticketFieldsSchema = z
  .object({
    projectId: z.string().min(1, "Project is required"),
    workDate: z.coerce.date({ message: "Work date is required" }),
    category: z.enum(ticketWorkCategories),
    title: z.string().min(3).max(200),
    description: z.string().max(4000).optional().nullable(),
    status: z.enum(ticketStatuses).default("OPEN"),
    assigneeId: z.string().optional().nullable(),
    reporterName: z.string().max(120).optional().nullable(),
    reporterEmail: z
      .union([z.string().email(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    syncToJira: z.boolean().default(false),
    notes: z.string().max(1000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasAssignee = Boolean(data.assigneeId);
    const hasReporter = Boolean(data.reporterName?.trim());
    if (!hasAssignee && !hasReporter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reporterName"],
        message: "Assign a developer or enter a non-dev reporter name",
      });
    }
  });

export const createTicketSchema = ticketFieldsSchema;

export const updateTicketSchema = ticketFieldsSchema.extend({
  id: z.string().min(1),
});

export const deleteTicketSchema = z.object({
  id: z.string().min(1),
});

export const listTicketsSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    projectId: z.string().optional(),
    category: z.enum(ticketWorkCategories).optional(),
    status: z.enum(ticketStatuses).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.to < data.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "End date must be on or after start date",
      });
    }
  });

export const syncTicketToJiraSchema = z.object({
  id: z.string().min(1),
});

export const bulkImportTicketRowSchema = z.object({
  workDate: z.coerce.date({ message: "workDate required (YYYY-MM-DD)" }),
  projectCode: z
    .string()
    .min(1)
    .transform((v) => v.trim().toUpperCase()),
  category: z
    .string()
    .transform((v) => v.trim().toUpperCase().replace(/\s+/g, "_"))
    .pipe(z.enum(ticketWorkCategories)),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional().nullable(),
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.trim().toUpperCase().replace(/\s+/g, "_") : "OPEN"))
    .pipe(z.enum(ticketStatuses)),
  assigneeEmail: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? String(v).trim().toLowerCase() : null)),
  reporterName: z.string().max(120).optional().nullable(),
  reporterEmail: z
    .string()
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return null;
      const s = String(v).trim().toLowerCase();
      return s || null;
    }),
  syncToJira: z
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
  notes: z.string().max(1000).optional().nullable(),
});

export const bulkImportTicketsSchema = z.object({
  rows: z
    .array(bulkImportTicketRowSchema)
    .min(1)
    .max(300, "Maximum 300 rows per import"),
});

export const TICKET_IMPORT_HEADERS = [
  "workDate",
  "projectCode",
  "category",
  "title",
  "description",
  "status",
  "assigneeEmail",
  "reporterName",
  "reporterEmail",
  "syncToJira",
  "notes",
] as const;

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type DeleteTicketInput = z.infer<typeof deleteTicketSchema>;
export type ListTicketsInput = z.infer<typeof listTicketsSchema>;
export type BulkImportTicketsInput = z.infer<typeof bulkImportTicketsSchema>;
export type SyncTicketToJiraInput = z.infer<typeof syncTicketToJiraSchema>;
