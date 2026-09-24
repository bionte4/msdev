import { z } from "zod";

const optionalJiraEmail = z
  .union([
    z.literal(""),
    z.string().email("Valid Jira account email is required"),
  ])
  .optional()
  .nullable()
  .transform((v) => {
    if (!v) return null;
    const trimmed = v.trim().toLowerCase();
    return trimmed.length === 0 ? null : trimmed;
  });

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
  standardCapacity: z.coerce.number().min(1).max(50).default(40),
  skillTags: z.string().max(500).optional(),
  jiraAccountEmail: optionalJiraEmail,
  startDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  clientId: z.string().optional(),
  overtimeEligible: z.boolean().default(true),
});

export const updatePersonnelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  jobTitle: z.string().min(2).max(120),
  hourlyRate: z.coerce.number().positive(),
  standardCapacity: z.coerce.number().min(1).max(50),
  skillTags: z.string().max(500).optional(),
  jiraAccountEmail: optionalJiraEmail,
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  isActive: z.boolean(),
  overtimeEligible: z.boolean(),
});

export const deactivatePersonnelSchema = z.object({
  id: z.string().min(1),
  endDate: z.coerce.date().optional(),
});

export const linkJiraAccountSchema = z.object({
  developerId: z.string().min(1),
  jiraAccountEmail: z
    .string()
    .trim()
    .email("Valid Jira account email is required")
    .transform((v) => v.toLowerCase()),
  jiraAccountId: z.string().max(120).optional().nullable(),
});

export const unlinkJiraAccountSchema = z.object({
  developerId: z.string().min(1),
});

export const testPersonnelJiraSchema = z.object({
  developerId: z.string().min(1).optional(),
  jiraAccountEmail: z
    .string()
    .trim()
    .email("Valid Jira account email is required")
    .transform((v) => v.toLowerCase()),
});

export type CreatePersonnelInput = z.infer<typeof createPersonnelSchema>;
export type UpdatePersonnelInput = z.infer<typeof updatePersonnelSchema>;
export type DeactivatePersonnelInput = z.infer<typeof deactivatePersonnelSchema>;
export type LinkJiraAccountInput = z.infer<typeof linkJiraAccountSchema>;
export type UnlinkJiraAccountInput = z.infer<typeof unlinkJiraAccountSchema>;
export type TestPersonnelJiraInput = z.infer<typeof testPersonnelJiraSchema>;

export function parseSkillTags(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}
