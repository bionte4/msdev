import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  code: z
    .string()
    .min(2, "Code is required")
    .max(32)
    .regex(
      /^[A-Z][A-Z0-9_-]*$/,
      "Code must be uppercase (e.g. PORTAL or ACME_APP)"
    ),
  clientId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  code: z
    .string()
    .min(2)
    .max(32)
    .regex(
      /^[A-Z][A-Z0-9_-]*$/,
      "Code must be uppercase (e.g. PORTAL or ACME_APP)"
    ),
  isActive: z.boolean(),
});

export const deactivateProjectSchema = z.object({
  id: z.string().min(1),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type DeactivateProjectInput = z.infer<typeof deactivateProjectSchema>;
