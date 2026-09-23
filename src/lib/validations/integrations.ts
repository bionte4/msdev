import { z } from "zod";

export const integrationProviders = [
  "EMAIL",
  "SMTP",
  "JIRA",
  "SERVICENOW",
] as const;

export type IntegrationProviderKey = (typeof integrationProviders)[number];

export const emailConfigSchema = z.object({
  fromName: z.string().min(1, "From name is required").max(120),
  fromAddress: z.string().email("Valid from email is required"),
  replyTo: z
    .string()
    .email("Valid reply-to email is required")
    .or(z.literal(""))
    .optional(),
  defaultCc: z.string().max(500).optional(),
});

export const smtpConfigSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().min(1, "SMTP username is required"),
  password: z.string().min(1, "SMTP password is required"),
  secure: z.boolean().default(true),
  fromOverride: z
    .string()
    .email("Valid override email required")
    .or(z.literal(""))
    .optional(),
});

export const jiraConfigSchema = z.object({
  baseUrl: z
    .string()
    .url("Valid Jira base URL is required")
    .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
      message: "Jira URL must start with http(s)://",
    }),
  email: z.string().email("Jira account email is required"),
  apiToken: z.string().min(8, "API token is required"),
  projectKey: z
    .string()
    .min(1, "Project key is required")
    .max(20)
    .regex(/^[A-Z][A-Z0-9]+$/, "Project key must be like PROJ"),
  issueType: z.string().min(1).default("Task"),
});

export const serviceNowConfigSchema = z.object({
  instanceUrl: z
    .string()
    .url("Valid ServiceNow instance URL is required")
    .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
      message: "Instance URL must start with http(s)://",
    }),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  assignmentGroup: z.string().max(120).optional(),
});

export const upsertIntegrationSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("EMAIL"),
    enabled: z.boolean(),
    config: emailConfigSchema,
  }),
  z.object({
    provider: z.literal("SMTP"),
    enabled: z.boolean(),
    config: smtpConfigSchema,
  }),
  z.object({
    provider: z.literal("JIRA"),
    enabled: z.boolean(),
    config: jiraConfigSchema,
  }),
  z.object({
    provider: z.literal("SERVICENOW"),
    enabled: z.boolean(),
    config: serviceNowConfigSchema,
  }),
]);

export type UpsertIntegrationInput = z.infer<typeof upsertIntegrationSchema>;
export type EmailConfig = z.infer<typeof emailConfigSchema>;
export type SmtpConfig = z.infer<typeof smtpConfigSchema>;
export type JiraConfig = z.infer<typeof jiraConfigSchema>;
export type ServiceNowConfig = z.infer<typeof serviceNowConfigSchema>;

export const DEFAULT_INTEGRATION_CONFIGS: Record<
  IntegrationProviderKey,
  {
    displayName: string;
    description: string;
    config: Record<string, unknown>;
  }
> = {
  EMAIL: {
    displayName: "Email notifications",
    description:
      "Sender identity for overtime, evaluation, and SLA alerts.",
    config: {
      fromName: "Governance Portal",
      fromAddress: "noreply@acme.example",
      replyTo: "",
      defaultCc: "",
    },
  },
  SMTP: {
    displayName: "SMTP relay",
    description: "Mail transport used to deliver portal notifications.",
    config: {
      host: "localhost",
      port: 1025,
      username: "msdev",
      password: "",
      secure: false,
      fromOverride: "",
    },
  },
  JIRA: {
    displayName: "Jira",
    description:
      "Create/sync replacement tickets and scope-swap issues in Jira.",
    config: {
      baseUrl: "https://your-org.atlassian.net",
      email: "",
      apiToken: "",
      projectKey: "GOV",
      issueType: "Task",
    },
  },
  SERVICENOW: {
    displayName: "ServiceNow",
    description:
      "Open incidents / change requests for SLA replacement workflows.",
    config: {
      instanceUrl: "https://your-instance.service-now.com",
      username: "",
      password: "",
      clientId: "",
      clientSecret: "",
      assignmentGroup: "",
    },
  },
};
