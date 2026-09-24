import { z } from "zod";

export const notificationTypes = [
  "INFO",
  "SUCCESS",
  "WARNING",
  "ALERT",
] as const;

export const accessRoles = [
  "SYS_ADMIN",
  "CLIENT_PM",
  "VENDOR_LEAD",
  "VENDOR_AM",
  "DEVELOPER",
] as const;

export const markNotificationReadSchema = z.object({
  id: z.string().min(1),
});

export const createNotificationSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(2).max(160),
  body: z.string().min(2).max(1000),
  href: z.string().max(300).optional().nullable(),
  type: z.enum(notificationTypes).default("INFO"),
});

export type MarkNotificationReadInput = z.infer<
  typeof markNotificationReadSchema
>;
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

const clientIdsField = z
  .array(z.string().min(1))
  .max(50)
  .optional()
  .default([]);

export const createAccessUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(accessRoles),
  /** @deprecated prefer clientIds; kept for single-client callers */
  clientId: z.string().optional().nullable(),
  clientIds: clientIdsField,
  primaryClientId: z.string().optional().nullable(),
  password: z.string().min(8).max(72).optional(),
  isActive: z.boolean().optional(),
});

export const updateAccessUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  role: z.enum(accessRoles),
  clientId: z.string().optional().nullable(),
  clientIds: clientIdsField,
  primaryClientId: z.string().optional().nullable(),
  isActive: z.boolean(),
  password: z.string().min(8).max(72).optional().nullable(),
});

export const setAccessUserActiveSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

export type CreateAccessUserInput = z.infer<typeof createAccessUserSchema>;
export type UpdateAccessUserInput = z.infer<typeof updateAccessUserSchema>;
export type SetAccessUserActiveInput = z.infer<
  typeof setAccessUserActiveSchema
>;
