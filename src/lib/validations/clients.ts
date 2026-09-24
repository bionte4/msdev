import { z } from "zod";

export const engagementModeSchema = z.enum(["MANAGED", "BODY_SHOPPING"]);

export const createClientSchema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  code: z
    .string()
    .min(2)
    .max(16)
    .regex(/^[A-Z][A-Z0-9_-]*$/, "Code must be uppercase (e.g. ACME)"),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  engagementMode: engagementModeSchema.optional(),
});

export const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  code: z
    .string()
    .min(2)
    .max(16)
    .regex(/^[A-Z][A-Z0-9_-]*$/, "Code must be uppercase (e.g. ACME)"),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean(),
  engagementMode: engagementModeSchema,
});

export const deactivateClientSchema = z.object({
  id: z.string().min(1),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type DeactivateClientInput = z.infer<typeof deactivateClientSchema>;
