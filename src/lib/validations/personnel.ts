import { z } from "zod";

export const createPersonnelSchema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  email: z.string().email("Valid email is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72)
    .optional(),
  jobTitle: z.string().min(2).max(120).default("Developer"),
  hourlyRate: z.coerce.number().positive("Hourly rate must be > 0"),
  standardCapacity: z.coerce
    .number()
    .min(1)
    .max(50)
    .default(40),
  skillTags: z.string().max(500).optional(),
  startDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  clientId: z.string().optional(),
});

export const updatePersonnelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  jobTitle: z.string().min(2).max(120),
  hourlyRate: z.coerce.number().positive(),
  standardCapacity: z.coerce.number().min(1).max(50),
  skillTags: z.string().max(500).optional(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean(),
});

export const deactivatePersonnelSchema = z.object({
  id: z.string().min(1),
  endDate: z.coerce.date().optional(),
});

export type CreatePersonnelInput = z.infer<typeof createPersonnelSchema>;
export type UpdatePersonnelInput = z.infer<typeof updatePersonnelSchema>;
export type DeactivatePersonnelInput = z.infer<typeof deactivatePersonnelSchema>;

export function parseSkillTags(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}
