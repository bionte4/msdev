import { prisma } from "@/lib/prisma";
import { jiraConfigSchema, type JiraConfig } from "@/lib/validations/integrations";

export interface JiraUserMatch {
  accountId: string;
  displayName: string;
  emailAddress: string | null;
  active: boolean;
}

export interface JiraConnectionOk {
  ok: true;
  config: JiraConfig;
  myself: { accountId: string; displayName: string; emailAddress?: string };
  project: { key: string; name: string; id: string };
}

export interface JiraConnectionFail {
  ok: false;
  error: string;
}

export interface JiraScopeOptions {
  /**
   * When true, enabled must be on (ticket sync / write).
   * When false, credentials alone are enough (verify, test, import pull).
   */
  requireEnabled?: boolean;
  /** Prefer ClientJiraConfig for this company; fall back to global Integrations → Jira. */
  clientId?: string | null;
  /** Override config.projectKey (e.g. Project.jiraProjectKey). */
  projectKeyOverride?: string | null;
}

function normalizeBaseUrl(url: string): string {
  let cleaned = url.trim().replace(/\/+$/, "");
  // Cloud UI often copies "...atlassian.net/jira" — REST API lives on the host root.
  cleaned = cleaned.replace(/\/jira$/i, "");
  return cleaned;
}

function basicAuthHeader(email: string, apiToken: string): string {
  const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return `Basic ${token}`;
}

async function jiraFetch(
  config: JiraConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = normalizeBaseUrl(config.baseUrl);
  const url = path.startsWith("http") ? path : `${base}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(config.email, config.apiToken),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

function parseConfigRecord(
  raw: unknown,
  sourceLabel: string
):
  | { ok: true; config: JiraConfig }
  | { ok: false; error: string } {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const parsed = jiraConfigSchema.safeParse(record);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => {
        const field = issue.path.filter(Boolean).join(".") || "field";
        return `${field}: ${issue.message}`;
      })
      .slice(0, 3)
      .join("; ");
    return {
      ok: false,
      error: `Jira credentials incomplete (${sourceLabel}). Save base URL, service-account email, API token, and project key. (${missing})`,
    };
  }

  if (!parsed.data.apiToken || parsed.data.apiToken.includes("••••")) {
    return {
      ok: false,
      error: `Jira API token is missing (${sourceLabel}). Re-save the token.`,
    };
  }

  return { ok: true, config: parsed.data };
}

/**
 * Resolve Jira credentials:
 * 1) ClientJiraConfig for clientId (if present)
 * 2) else global IntegrationConfig provider=JIRA
 * Then apply optional projectKeyOverride.
 */
export async function loadJiraConfig(options?: JiraScopeOptions): Promise<
  | {
      ok: true;
      config: JiraConfig;
      enabled: boolean;
      source: "client" | "global";
      clientId: string | null;
    }
  | { ok: false; error: string }
> {
  const requireEnabled = options?.requireEnabled ?? true;
  const clientId = options?.clientId?.trim() || null;
  const projectKeyOverride = options?.projectKeyOverride?.trim() || null;

  if (clientId) {
    const clientRow = await prisma.clientJiraConfig.findUnique({
      where: { clientId },
    });
    if (clientRow) {
      if (requireEnabled && !clientRow.enabled) {
        return {
          ok: false,
          error:
            "Jira sync is disabled for this company. Enable Client Jira in Integrations (or use global) to sync tickets.",
        };
      }
      const parsed = parseConfigRecord(
        clientRow.config,
        `Client Jira · ${clientId}`
      );
      if (!parsed.ok) return parsed;
      const config: JiraConfig = {
        ...parsed.config,
        projectKey: projectKeyOverride || parsed.config.projectKey,
        baseUrl: normalizeBaseUrl(parsed.config.baseUrl),
      };
      return {
        ok: true,
        config,
        enabled: clientRow.enabled,
        source: "client",
        clientId,
      };
    }
  }

  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "JIRA" },
  });
  if (!row) {
    return {
      ok: false,
      error: clientId
        ? "No Client Jira config and no global Integrations → Jira. Save credentials for this company or the global default."
        : "Jira is not configured. Ask SYS_ADMIN to save credentials in Integrations → Jira.",
    };
  }
  if (requireEnabled && !row.enabled) {
    return {
      ok: false,
      error:
        "Jira sync is disabled. Enable Integrations → Jira (global) or Client Jira to sync tickets (personnel verify still works once credentials are saved).",
    };
  }

  const parsed = parseConfigRecord(row.config, "Integrations → Jira (global)");
  if (!parsed.ok) return parsed;

  const config: JiraConfig = {
    ...parsed.config,
    projectKey: projectKeyOverride || parsed.config.projectKey,
    baseUrl: normalizeBaseUrl(parsed.config.baseUrl),
  };

  return {
    ok: true,
    config,
    enabled: row.enabled,
    source: "global",
    clientId,
  };
}

export async function testJiraConnection(
  scope?: JiraScopeOptions
): Promise<JiraConnectionOk | JiraConnectionFail> {
  // Allow testing credentials before the "enabled" toggle is turned on.
  const loaded = await loadJiraConfig({
    ...scope,
    requireEnabled: false,
  });
  if (!loaded.ok) return loaded;

  const { config } = loaded;

  try {
    const myselfRes = await jiraFetch(config, "/rest/api/3/myself");
    if (!myselfRes.ok) {
      const body = await myselfRes.text();
      return {
        ok: false,
        error: `Jira auth failed (${myselfRes.status}): ${body.slice(0, 180) || myselfRes.statusText}`,
      };
    }

    const myself = (await myselfRes.json()) as {
      accountId?: string;
      displayName?: string;
      emailAddress?: string;
    };

    const projectRes = await jiraFetch(
      config,
      `/rest/api/3/project/${encodeURIComponent(config.projectKey)}`
    );
    if (!projectRes.ok) {
      const body = await projectRes.text();
      return {
        ok: false,
        error: `Jira project “${config.projectKey}” not accessible (${projectRes.status}): ${body.slice(0, 180) || projectRes.statusText}`,
      };
    }

    const project = (await projectRes.json()) as {
      id?: string;
      key?: string;
      name?: string;
    };

    return {
      ok: true,
      config,
      myself: {
        accountId: myself.accountId ?? "",
        displayName: myself.displayName ?? "Unknown",
        emailAddress: myself.emailAddress,
      },
      project: {
        key: project.key ?? config.projectKey,
        name: project.name ?? config.projectKey,
        id: project.id ?? "",
      },
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Jira connection error: ${error.message}`
          : "Jira connection error",
    };
  }
}

function pickBestUser(
  users: Array<{
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
    active?: boolean;
  }>,
  query: string
): JiraUserMatch | null {
  const q = query.trim().toLowerCase();
  const withId = users.filter((u) => u.accountId);
  if (withId.length === 0) return null;

  const exactEmail = withId.find(
    (u) => u.emailAddress?.toLowerCase() === q
  );
  const pick = exactEmail ?? withId[0];
  if (!pick.accountId) return null;

  return {
    accountId: pick.accountId,
    displayName: pick.displayName ?? pick.emailAddress ?? query,
    emailAddress: pick.emailAddress ?? null,
    active: pick.active ?? true,
  };
}

/**
 * Resolve Atlassian accountId for an email via Jira Cloud REST.
 * Tries user/search then assignable/search (project-scoped).
 */
export async function verifyJiraUserByEmail(
  email: string,
  scope?: JiraScopeOptions
): Promise<
  | { ok: true; user: JiraUserMatch; config: JiraConfig }
  | { ok: false; error: string }
> {
  const skip = process.env.JIRA_SKIP_VERIFY === "true";
  if (skip) {
    const loaded = await loadJiraConfig({
      ...scope,
      requireEnabled: false,
    });
    if (!loaded.ok) {
      return {
        ok: true,
        user: {
          accountId: `local-skip:${email.trim().toLowerCase()}`,
          displayName: email,
          emailAddress: email,
          active: true,
        },
        config: {
          baseUrl: "https://local.skip",
          email: "skip@local",
          apiToken: "skip-token",
          projectKey: "SKIP",
          issueType: "Task",
        },
      };
    }
    return {
      ok: true,
      user: {
        accountId: `local-skip:${email.trim().toLowerCase()}`,
        displayName: email,
        emailAddress: email,
        active: true,
      },
      config: loaded.config,
    };
  }

  const connection = await testJiraConnection(scope);
  if (!connection.ok) return connection;

  const { config } = connection;
  const query = email.trim();

  try {
    const searchRes = await jiraFetch(
      config,
      `/rest/api/3/user/search?query=${encodeURIComponent(query)}&maxResults=20`
    );

    if (searchRes.ok) {
      const users = (await searchRes.json()) as Array<{
        accountId?: string;
        displayName?: string;
        emailAddress?: string;
        active?: boolean;
      }>;
      const match = pickBestUser(users, query);
      if (match) {
        return { ok: true, user: match, config };
      }
    }

    const assignableRes = await jiraFetch(
      config,
      `/rest/api/3/user/assignable/search?project=${encodeURIComponent(config.projectKey)}&query=${encodeURIComponent(query)}&maxResults=20`
    );

    if (assignableRes.ok) {
      const users = (await assignableRes.json()) as Array<{
        accountId?: string;
        displayName?: string;
        emailAddress?: string;
        active?: boolean;
      }>;
      const match = pickBestUser(users, query);
      if (match) {
        return { ok: true, user: match, config };
      }
    } else if (!searchRes.ok) {
      const body = await assignableRes.text();
      return {
        ok: false,
        error: `Jira user lookup failed (${assignableRes.status}): ${body.slice(0, 180) || assignableRes.statusText}`,
      };
    }

    return {
      ok: false,
      error: `No Jira user found for “${query}” in project ${config.projectKey}. Check the email or grant browse-users permission to the integration account.`,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Jira user verify error: ${error.message}`
          : "Jira user verify error",
    };
  }
}

function adfDescription(text: string) {
  return {
    type: "doc" as const,
    version: 1 as const,
    content: [
      {
        type: "paragraph" as const,
        content: [{ type: "text" as const, text: text.slice(0, 8000) }],
      },
    ],
  };
}

export async function createJiraIssue(
  input: {
    summary: string;
    description?: string | null;
    labels?: string[];
  },
  scope?: JiraScopeOptions
): Promise<
  | { ok: true; key: string; id: string; config: JiraConfig }
  | { ok: false; error: string }
> {
  const loaded = await loadJiraConfig({
    ...scope,
    requireEnabled: true,
  });
  if (!loaded.ok) return loaded;

  const { config } = loaded;
  const text = (input.description ?? "").trim() || input.summary;

  try {
    const res = await jiraFetch(config, "/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({
        fields: {
          project: { key: config.projectKey },
          summary: input.summary.slice(0, 255),
          issuetype: { name: config.issueType || "Task" },
          labels: input.labels?.slice(0, 10) ?? [],
          description: adfDescription(text),
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: `Jira create issue failed (${res.status}): ${body.slice(0, 220) || res.statusText}`,
      };
    }

    const data = (await res.json()) as { id?: string; key?: string };
    if (!data.id || !data.key) {
      return { ok: false, error: "Jira did not return issue id/key" };
    }

    return { ok: true, id: data.id, key: data.key, config };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Jira create error: ${error.message}`
          : "Jira create error",
    };
  }
}

/**
 * Push portal field changes to an existing Jira issue (summary + description + labels).
 * Requires Enabled on the resolved client/global config (write path).
 */
export async function updateJiraIssue(
  input: {
    issueKey: string;
    summary: string;
    description?: string | null;
    labels?: string[];
  },
  scope?: JiraScopeOptions
): Promise<{ ok: true; key: string; config: JiraConfig } | { ok: false; error: string }> {
  const loaded = await loadJiraConfig({
    ...scope,
    requireEnabled: true,
  });
  if (!loaded.ok) return loaded;

  const { config } = loaded;
  const key = input.issueKey.trim();
  if (!key) return { ok: false, error: "Jira issue key is required" };

  const text = (input.description ?? "").trim() || input.summary;

  try {
    const res = await jiraFetch(
      config,
      `/rest/api/3/issue/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          fields: {
            summary: input.summary.slice(0, 255),
            description: adfDescription(text),
            ...(input.labels ? { labels: input.labels.slice(0, 10) } : {}),
          },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        error: `Jira update failed (${res.status}): ${body.slice(0, 220) || res.statusText}`,
      };
    }

    return { ok: true, key, config };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Jira update error: ${error.message}`
          : "Jira update error",
    };
  }
}

/**
 * Best-effort status sync via Jira transitions (workflow names vary by project).
 */
export async function transitionJiraIssue(
  input: {
    issueKey: string;
    portalStatus: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  },
  scope?: JiraScopeOptions
): Promise<
  | { ok: true; transitioned: boolean; name?: string }
  | { ok: false; error: string }
> {
  const loaded = await loadJiraConfig({
    ...scope,
    requireEnabled: true,
  });
  if (!loaded.ok) return loaded;

  const { config } = loaded;
  const key = input.issueKey.trim();

  const preferred: Record<string, string[]> = {
    OPEN: ["to do", "todo", "open", "backlog", "reopen"],
    IN_PROGRESS: ["in progress", "start progress", "progress", "doing"],
    DONE: [
      "done",
      "close",
      "closed",
      "resolve",
      "resolved",
      "complete",
      "completed",
    ],
    CANCELLED: ["cancel", "cancelled", "won't do", "wont do", "decline"],
  };

  try {
    const listRes = await jiraFetch(
      config,
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`
    );
    if (!listRes.ok) {
      const body = await listRes.text();
      return {
        ok: false,
        error: `Jira transitions failed (${listRes.status}): ${body.slice(0, 180)}`,
      };
    }

    const data = (await listRes.json()) as {
      transitions?: Array<{
        id?: string;
        name?: string;
        to?: { name?: string };
      }>;
    };
    const transitions = data.transitions ?? [];
    if (transitions.length === 0) {
      return { ok: true, transitioned: false };
    }

    const targets = preferred[input.portalStatus] ?? [];
    const match = transitions.find((t) => {
      const name = `${t.name ?? ""} ${t.to?.name ?? ""}`.toLowerCase();
      return targets.some((p) => name.includes(p));
    });

    if (!match?.id) {
      return { ok: true, transitioned: false };
    }

    const doRes = await jiraFetch(
      config,
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
      {
        method: "POST",
        body: JSON.stringify({ transition: { id: match.id } }),
      }
    );

    if (!doRes.ok) {
      const body = await doRes.text();
      return {
        ok: false,
        error: `Jira transition apply failed (${doRes.status}): ${body.slice(0, 180)}`,
      };
    }

    return { ok: true, transitioned: true, name: match.name };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Jira transition error: ${error.message}`
          : "Jira transition error",
    };
  }
}

export interface JiraIssueImportRow {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  statusName: string;
  statusCategory: string | null;
  assigneeAccountId: string | null;
  assigneeEmail: string | null;
  assigneeDisplayName: string | null;
  labels: string[];
  issueType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function extractAdfText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content.map(extractAdfText).join(n.type === "paragraph" ? "\n" : "");
}

/**
 * Pull issues from the resolved Jira project (read-only).
 * Credentials required; Enabled toggle not required (Enabled gates outbound sync).
 */
export async function searchJiraIssues(input?: {
  maxResults?: number;
  jql?: string;
  scope?: JiraScopeOptions;
}): Promise<
  | { ok: true; issues: JiraIssueImportRow[]; config: JiraConfig; jql: string }
  | { ok: false; error: string }
> {
  const loaded = await loadJiraConfig({
    ...input?.scope,
    requireEnabled: false,
  });
  if (!loaded.ok) return loaded;

  const { config } = loaded;
  const maxResults = Math.min(Math.max(input?.maxResults ?? 50, 1), 100);
  const jql =
    input?.jql?.trim() ||
    `project = ${config.projectKey} ORDER BY updated DESC`;

  try {
    const fieldList = [
      "summary",
      "description",
      "status",
      "assignee",
      "created",
      "updated",
      "issuetype",
      "labels",
    ];

    type RawIssue = {
      id?: string;
      key?: string;
      fields?: {
        summary?: string;
        description?: unknown;
        status?: {
          name?: string;
          statusCategory?: { key?: string; name?: string };
        };
        assignee?: {
          accountId?: string;
          emailAddress?: string;
          displayName?: string;
        } | null;
        labels?: string[];
        issuetype?: { name?: string };
        created?: string;
        updated?: string;
      };
    };

    const collected: RawIssue[] = [];
    let nextPageToken: string | undefined;

    while (collected.length < maxResults) {
      const pageSize = Math.min(maxResults - collected.length, 100);
      const res = await jiraFetch(config, "/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults: pageSize,
          fields: fieldList,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return {
          ok: false,
          error: `Jira search failed (${res.status}): ${body.slice(0, 220) || res.statusText}`,
        };
      }

      const data = (await res.json()) as {
        issues?: RawIssue[];
        nextPageToken?: string;
      };

      const page = data.issues ?? [];
      collected.push(...page);

      if (!data.nextPageToken || page.length === 0) break;
      nextPageToken = data.nextPageToken;
    }

    const issues: JiraIssueImportRow[] = collected
      .filter((issue) => issue.id && issue.key)
      .slice(0, maxResults)
      .map((issue) => {
        const fields = issue.fields ?? {};
        const descriptionRaw = fields.description;
        const description =
          typeof descriptionRaw === "string"
            ? descriptionRaw
            : extractAdfText(descriptionRaw).trim() || null;

        return {
          id: issue.id!,
          key: issue.key!,
          summary: (fields.summary ?? issue.key!).slice(0, 200),
          description: description ? description.slice(0, 4000) : null,
          statusName: fields.status?.name ?? "Open",
          statusCategory:
            fields.status?.statusCategory?.key ??
            fields.status?.statusCategory?.name ??
            null,
          assigneeAccountId: fields.assignee?.accountId ?? null,
          assigneeEmail: fields.assignee?.emailAddress ?? null,
          assigneeDisplayName: fields.assignee?.displayName ?? null,
          labels: Array.isArray(fields.labels) ? fields.labels : [],
          issueType: fields.issuetype?.name ?? null,
          createdAt: fields.created ?? null,
          updatedAt: fields.updated ?? null,
        };
      });

    return { ok: true, issues, config, jql };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Jira search error: ${error.message}`
          : "Jira search error",
    };
  }
}
