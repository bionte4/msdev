import { z } from "zod";

/** Empty / null / undefined → null; otherwise must be a valid email. */
const optionalJiraEmail = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") return v;
    const trimmed = v.trim().toLowerCase();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.union([
    z.null(),
    z.string().email("Valid Jira account email is required"),
  ])
);

const optionalNotes = z.preprocess(
  (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim().length === 0) return undefined;
    return v;
  },
  z.string().max(1000).optional()
);

const optionalSkillTags = z.preprocess(
  (v) => (v === undefined || v === null ? "" : v),
  z.string().max(500)
);

export const createPersonnelSchema = z.object({
  name: z.string().min(2, "Name is required").max(120),
  email: z.string().email("Valid email is required"),
  password: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.string().min(8, "Password must be at least 8 characters").max(72).optional()
  ),
  jobTitle: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? "Developer" : v),
    z.string().min(2).max(120)
  ),
  hourlyRate: z.coerce.number().positive("Hourly rate must be > 0"),
  standardCapacity: z.coerce.number().min(1).max(50).default(40),
  skillTags: optionalSkillTags,
  jiraAccountEmail: optionalJiraEmail,
  startDate: z.coerce.date().optional(),
  notes: optionalNotes,
  clientId: z.string().optional(),
  overtimeEligible: z.preprocess(
    (v) => (v === undefined || v === null ? true : v),
    z.boolean()
  ),
});

export const updatePersonnelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  jobTitle: z.string().min(2).max(120),
  hourlyRate: z.coerce.number().positive(),
  standardCapacity: z.coerce.number().min(1).max(50),
  skillTags: optionalSkillTags,
  jiraAccountEmail: optionalJiraEmail,
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  notes: z.preprocess(
    (v) => {
      if (v === undefined) return null;
      if (typeof v === "string" && v.trim().length === 0) return null;
      return v;
    },
    z.string().max(1000).nullable()
  ),
  isActive: z.boolean(),
  overtimeEligible: z.preprocess(
    (v) => (v === undefined || v === null ? true : v),
    z.boolean()
  ),
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
    .string({ error: "Jira account email is required" })
    .trim()
    .min(1, "Jira account email is required")
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

export function formatZodError(
  error: z.ZodError,
  fallback = "Invalid input"
): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  const path = issue.path.filter(Boolean).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
