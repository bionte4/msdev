"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { testJiraConnection } from "@/lib/jira/client";
import {
  DEFAULT_INTEGRATION_CONFIGS,
  upsertClientJiraSchema,
  upsertIntegrationSchema,
  type IntegrationProviderKey,
  type UpsertClientJiraInput,
  type UpsertIntegrationInput,
} from "@/lib/validations/integrations";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface IntegrationCardData {
  id: string;
  provider: IntegrationProviderKey;
  displayName: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
  lastTestedAt: string | null;
  lastTestStatus: "NEVER" | "SUCCESS" | "FAILED";
  lastTestMessage: string | null;
  updatedAt: string;
}

function asJson(
  value: Record<string, unknown>
): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asConfigRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function maskSecrets(
  provider: IntegrationProviderKey,
  config: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...config };
  if (provider === "SMTP" && typeof next.password === "string" && next.password) {
    next.password = "••••••••";
  }
  if (provider === "JIRA" && typeof next.apiToken === "string" && next.apiToken) {
    next.apiToken = "••••••••";
  }
  if (
    provider === "SERVICENOW" &&
    typeof next.password === "string" &&
    next.password
  ) {
    next.password = "••••••••";
  }
  if (
    provider === "SERVICENOW" &&
    typeof next.clientSecret === "string" &&
    next.clientSecret
  ) {
    next.clientSecret = "••••••••";
  }
  return next;
}

function isMaskedSecret(value: unknown): boolean {
  return typeof value === "string" && value.includes("••••");
}

async function ensureDefaults(): Promise<void> {
  for (const provider of Object.keys(
    DEFAULT_INTEGRATION_CONFIGS
  ) as IntegrationProviderKey[]) {
    const defaults = DEFAULT_INTEGRATION_CONFIGS[provider];
    await prisma.integrationConfig.upsert({
      where: { provider },
      update: {},
      create: {
        provider,
        displayName: defaults.displayName,
        description: defaults.description,
        enabled: false,
        config: asJson(defaults.config),
        lastTestStatus: "NEVER",
      },
    });
  }
}

export async function listIntegrations(): Promise<
  ActionResult<IntegrationCardData[]>
> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);

    await ensureDefaults();

    const rows = await prisma.integrationConfig.findMany({
      orderBy: { provider: "asc" },
    });

    const canSeeSecrets = session.user.role === "SYS_ADMIN";

    return ok(
      rows.map((row) => {
        const provider = row.provider as IntegrationProviderKey;
        const raw = asConfigRecord(row.config);
        return {
          id: row.id,
          provider,
          displayName: row.displayName,
          description: row.description,
          enabled: row.enabled,
          config: canSeeSecrets ? raw : maskSecrets(provider, raw),
          lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
          lastTestStatus: row.lastTestStatus,
          lastTestMessage: row.lastTestMessage,
          updatedAt: row.updatedAt.toISOString(),
        };
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load integrations";
    return fail(message);
  }
}

export async function upsertIntegration(
  input: UpsertIntegrationInput
): Promise<ActionResult<IntegrationCardData>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);

    const parsed = upsertIntegrationSchema.safeParse(input);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid integration config"
      );
    }

    const existing = await prisma.integrationConfig.findUnique({
      where: { provider: parsed.data.provider },
    });

    const previous = asConfigRecord(existing?.config ?? {});
    const incoming = { ...parsed.data.config } as Record<string, unknown>;

    if (parsed.data.provider === "SMTP" && isMaskedSecret(incoming.password)) {
      incoming.password = previous.password ?? "";
    }
    if (parsed.data.provider === "JIRA" && isMaskedSecret(incoming.apiToken)) {
      incoming.apiToken = previous.apiToken ?? "";
      if (!incoming.apiToken) {
        return fail(
          "Jira API token is required. Paste the Atlassian API token, then Save."
        );
      }
    }
    if (parsed.data.provider === "SERVICENOW") {
      if (isMaskedSecret(incoming.password)) {
        incoming.password = previous.password ?? "";
      }
      if (isMaskedSecret(incoming.clientSecret)) {
        incoming.clientSecret = previous.clientSecret ?? "";
      }
    }

    if (parsed.data.provider === "JIRA") {
      const token = String(incoming.apiToken ?? "");
      if (!token || token.includes("••••")) {
        return fail(
          "Jira API token is required. Paste the Atlassian API token, then Save."
        );
      }
    }

    const defaults = DEFAULT_INTEGRATION_CONFIGS[parsed.data.provider];

    const row = await prisma.integrationConfig.upsert({
      where: { provider: parsed.data.provider },
      update: {
        enabled: parsed.data.enabled,
        config: asJson(incoming),
        updatedById: session.user.id,
      },
      create: {
        provider: parsed.data.provider,
        displayName: defaults.displayName,
        description: defaults.description,
        enabled: parsed.data.enabled,
        config: asJson(incoming),
        updatedById: session.user.id,
        lastTestStatus: "NEVER",
      },
    });

    return ok({
      id: row.id,
      provider: row.provider as IntegrationProviderKey,
      displayName: row.displayName,
      description: row.description,
      enabled: row.enabled,
      config: incoming,
      lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
      lastTestStatus: row.lastTestStatus,
      lastTestMessage: row.lastTestMessage,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save integration";
    return fail(message);
  }
}

export async function testIntegration(
  provider: IntegrationProviderKey
): Promise<ActionResult<{ status: "SUCCESS" | "FAILED"; message: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);

    const row = await prisma.integrationConfig.findUnique({
      where: { provider },
    });

    if (!row) {
      return fail("Integration not found. Save configuration first.");
    }

    // Testing credentials is allowed while Enabled is off (Enabled gates live sync only).
    const config = asConfigRecord(row.config);
    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    let message = "Configuration looks valid (local dry-run).";

    if (provider === "EMAIL") {
      if (!config.fromAddress) {
        status = "FAILED";
        message = "From address is missing.";
      } else {
        message = `Email identity ready: ${String(config.fromAddress)}`;
      }
    }

    if (provider === "SMTP") {
      if (!config.host || !config.port || !config.username) {
        status = "FAILED";
        message = "SMTP host, port, and username are required.";
      } else if (!config.password) {
        status = "FAILED";
        message = "SMTP password is empty.";
      } else {
        message = `SMTP relay configured for ${String(config.host)}:${String(config.port)} (dry-run, no message sent).`;
      }
    }

    if (provider === "JIRA") {
      if (!config.baseUrl || !config.email || !config.apiToken || !config.projectKey) {
        status = "FAILED";
        message =
          "Save configuration first: Jira base URL, account email, API token, and project key must be stored before Test.";
      } else {
        const live = await testJiraConnection();
        if (!live.ok) {
          status = "FAILED";
          message = live.error;
        } else {
          message = `Connected as ${live.myself.displayName} · project ${live.project.key} (${live.project.name})`;
        }
      }
    }

    if (provider === "SERVICENOW") {
      if (!config.instanceUrl || !config.username || !config.password) {
        status = "FAILED";
        message = "ServiceNow instance URL, username, and password are required.";
      } else {
        message = `ServiceNow instance ${String(config.instanceUrl)} credentials present (dry-run).`;
      }
    }

    await prisma.integrationConfig.update({
      where: { provider },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: status,
        lastTestMessage: message,
        updatedById: session.user.id,
      },
    });

    if (status === "FAILED") {
      return fail(message);
    }

    return ok({ status, message });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to test integration";
    return fail(message);
  }
}

export interface ClientJiraCardData {
  clientId: string;
  clientName: string;
  clientCode: string;
  configured: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  lastTestedAt: string | null;
  lastTestStatus: "NEVER" | "SUCCESS" | "FAILED";
  lastTestMessage: string | null;
}

export async function listClientJiraConfigs(): Promise<
  ActionResult<ClientJiraCardData[]>
> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);

    const clients = await prisma.client.findMany({
      where:
        session.user.role === "SYS_ADMIN"
          ? { isActive: true }
          : session.user.clientId
            ? { id: session.user.clientId, isActive: true }
            : { id: "__none__" },
      orderBy: { name: "asc" },
      include: { jiraConfig: true },
    });

    return ok(
      clients.map((c) => {
        const row = c.jiraConfig;
        const raw = row ? asConfigRecord(row.config) : {};
        return {
          clientId: c.id,
          clientName: c.name,
          clientCode: c.code,
          configured: Boolean(row),
          enabled: row?.enabled ?? false,
          config: row
            ? maskSecrets("JIRA", raw)
            : {
                ...DEFAULT_INTEGRATION_CONFIGS.JIRA.config,
              },
          lastTestedAt: row?.lastTestedAt?.toISOString() ?? null,
          lastTestStatus: (row?.lastTestStatus ?? "NEVER") as
            | "NEVER"
            | "SUCCESS"
            | "FAILED",
          lastTestMessage: row?.lastTestMessage ?? null,
        };
      })
    );
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "Failed to list client Jira configs";
    if (
      raw.includes("ClientJiraConfig") &&
      (raw.includes("does not exist") || raw.includes("P2021"))
    ) {
      return fail(
        "Database schema outdated: table ClientJiraConfig is missing. On the production server run: npx prisma db push && restart the app."
      );
    }
    return fail(raw);
  }
}

export async function upsertClientJiraConfig(
  input: UpsertClientJiraInput
): Promise<ActionResult<ClientJiraCardData>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);

    const parsed = upsertClientJiraSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid client Jira config");
    }

    const client = await prisma.client.findUnique({
      where: { id: parsed.data.clientId },
    });
    if (!client) return fail("Client not found");

    const existing = await prisma.clientJiraConfig.findUnique({
      where: { clientId: parsed.data.clientId },
    });
    const previous = asConfigRecord(existing?.config ?? {});
    const incoming = { ...parsed.data.config } as Record<string, unknown>;
    incoming.baseUrl = String(incoming.baseUrl ?? "")
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/jira$/i, "");

    if (isMaskedSecret(incoming.apiToken)) {
      incoming.apiToken = previous.apiToken ?? "";
      if (!incoming.apiToken) {
        return fail(
          "Jira API token is required. Paste the Atlassian API token, then Save."
        );
      }
    }
    if (!incoming.apiToken || String(incoming.apiToken).includes("••••")) {
      return fail(
        "Jira API token is required. Paste the Atlassian API token, then Save."
      );
    }

    const row = await prisma.clientJiraConfig.upsert({
      where: { clientId: parsed.data.clientId },
      update: {
        enabled: parsed.data.enabled,
        config: asJson(incoming),
        updatedById: session.user.id,
      },
      create: {
        clientId: parsed.data.clientId,
        enabled: parsed.data.enabled,
        displayName: "Jira",
        config: asJson(incoming),
        updatedById: session.user.id,
        lastTestStatus: "NEVER",
      },
    });

    return ok({
      clientId: client.id,
      clientName: client.name,
      clientCode: client.code,
      configured: true,
      enabled: row.enabled,
      config: maskSecrets("JIRA", incoming),
      lastTestedAt: row.lastTestedAt?.toISOString() ?? null,
      lastTestStatus: row.lastTestStatus as "NEVER" | "SUCCESS" | "FAILED",
      lastTestMessage: row.lastTestMessage,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save client Jira config";
    return fail(message);
  }
}

export async function testClientJiraConnection(
  input: { clientId: string }
): Promise<ActionResult<{ status: "SUCCESS" | "FAILED"; message: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);

    const row = await prisma.clientJiraConfig.findUnique({
      where: { clientId: input.clientId },
    });
    if (!row) {
      return fail("Save Client Jira configuration first.");
    }

    const live = await testJiraConnection({
      clientId: input.clientId,
      requireEnabled: false,
    });

    const status: "SUCCESS" | "FAILED" = live.ok ? "SUCCESS" : "FAILED";
    const message = live.ok
      ? `Connected as ${live.myself.displayName} · project ${live.project.key} (${live.project.name})`
      : live.error;

    await prisma.clientJiraConfig.update({
      where: { clientId: input.clientId },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: status,
        lastTestMessage: message,
        updatedById: session.user.id,
      },
    });

    if (status === "FAILED") return fail(message);
    return ok({ status, message });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to test client Jira connection";
    return fail(message);
  }
}

/** Manual trigger for scheduled pull (all companies with Client Jira). */
export async function runJiraPullNow(): Promise<
  ActionResult<{
    imported: number;
    updated: number;
    skipped: number;
    companies: number;
    projects: number;
    message: string;
  }>
> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);

    const { runScheduledJiraPull } = await import(
      "@/lib/jira/scheduled-pull"
    );
    const result = await runScheduledJiraPull({ maxResultsPerProject: 50 });
    return ok({
      imported: result.imported,
      updated: result.updated,
      skipped: result.skipped,
      companies: result.companies,
      projects: result.projects,
      message: `Pull done · ${result.companies} companies · +${result.imported} new · ~${result.updated} updated · skip ${result.skipped}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to run Jira pull";
    return fail(message);
  }
}
