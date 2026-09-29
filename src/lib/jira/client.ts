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

export async function loadJiraConfig(options?: {
  /**
   * When true, IntegrationConfig.enabled must be on (ticket sync / live features).
   * When false, credentials alone are enough (personnel verify, Integrations test).
   */
  requireEnabled?: boolean;
}): Promise<
  | { ok: true; config: JiraConfig; enabled: boolean }
  | { ok: false; error: string }
> {
  const requireEnabled = options?.requireEnabled ?? true;

  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "JIRA" },
  });
  if (!row) {
    return {
      ok: false,
      error:
        "Jira is not configured. Ask SYS_ADMIN to save credentials in Integrations → Jira.",
    };
  }
  if (requireEnabled && !row.enabled) {
    return {
      ok: false,
      error:
        "Jira sync is disabled. Enable Integrations → Jira to sync tickets (personnel verify still works once credentials are saved).",
    };
  }

  const raw =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};

  const parsed = jiraConfigSchema.safeParse(raw);
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
      error: `Jira credentials incomplete in Integrations → Jira. Save base URL, service-account email, API token, and project key first. (${missing})`,
    };
  }

  if (!parsed.data.apiToken || parsed.data.apiToken.includes("••••")) {
    return {
      ok: false,
      error: "Jira API token is missing. Re-save the token in Integrations.",
    };
  }

  return { ok: true, config: parsed.data, enabled: row.enabled };
}

export async function testJiraConnection(): Promise<
  JiraConnectionOk | JiraConnectionFail
> {
  // Allow testing credentials before the "enabled" toggle is turned on.
  const loaded = await loadJiraConfig({ requireEnabled: false });
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
    if (!myself.accountId) {
      return { ok: false, error: "Jira /myself did not return an accountId" };
    }

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
        accountId: myself.accountId,
        displayName: myself.displayName ?? myself.accountId,
        emailAddress: myself.emailAddress,
      },
      project: {
        id: project.id ?? "",
        key: project.key ?? config.projectKey,
        name: project.name ?? config.projectKey,
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
  email: string
): JiraUserMatch | null {
  const needle = email.trim().toLowerCase();
  const withId = users.filter((u) => u.accountId);
  if (withId.length === 0) return null;

  const exactEmail = withId.find(
    (u) => (u.emailAddress ?? "").toLowerCase() === needle
  );
  const chosen = exactEmail ?? withId[0];
  if (!chosen.accountId) return null;

  return {
    accountId: chosen.accountId,
    displayName: chosen.displayName ?? chosen.accountId,
    emailAddress: chosen.emailAddress ?? null,
    active: chosen.active !== false,
  };
}

/**
 * Resolve Atlassian accountId for an email via Jira Cloud REST.
 * Tries user/search then assignable/search (project-scoped).
 */
export async function verifyJiraUserByEmail(
  email: string
): Promise<
  | { ok: true; user: JiraUserMatch; config: JiraConfig }
  | { ok: false; error: string }
> {
  const skip = process.env.JIRA_SKIP_VERIFY === "true";
  if (skip) {
    const loaded = await loadJiraConfig({ requireEnabled: false });
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

  const connection = await testJiraConnection();
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
        if (
          match.emailAddress &&
          match.emailAddress.toLowerCase() !== query.toLowerCase()
        ) {
          // Ambiguous / email redacted — still accept if single strong match from query
        }
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

export async function createJiraIssue(input: {
  summary: string;
  description?: string | null;
  labels?: string[];
}): Promise<
  | { ok: true; key: string; id: string; config: JiraConfig }
  | { ok: false; error: string }
> {
  const loaded = await loadJiraConfig({ requireEnabled: true });
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
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: text.slice(0, 8000) }],
              },
            ],
          },
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

/**
 * Push portal field changes to an existing Jira issue (summary + description + labels).
 * Requires Integrations → Jira Enabled (write path).
 */
export async function updateJiraIssue(input: {
  issueKey: string;
  summary: string;
  description?: string | null;
  labels?: string[];
}): Promise<{ ok: true; key: string; config: JiraConfig } | { ok: false; error: string }> {
  const loaded = await loadJiraConfig({ requireEnabled: true });
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
export async function transitionJiraIssue(input: {
  issueKey: string;
  portalStatus: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
}): Promise<{ ok: true; transitioned: boolean; name?: string } | { ok: false; error: string }> {
  const loaded = await loadJiraConfig({ requireEnabled: true });
  if (!loaded.ok) return loaded;

  const { config } = loaded;
  const key = input.issueKey.trim();

  const preferred: Record<string, string[]> = {
    OPEN: ["to do", "todo", "open", "backlog", "reopen", "to do"],
    IN_PROGRESS: ["in progress", "start progress", "progress", "doing"],
    DONE: ["done", "close", "closed", "resolve", "resolved", "complete", "completed"],
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
      transitions?: Array<{ id?: string; name?: string; to?: { name?: string } }>;
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
 * Pull issues from the configured Jira project (read-only).
 * Credentials required; Enabled toggle not required (Enabled gates outbound sync).
 */
export async function searchJiraIssues(input?: {
  maxResults?: number;
  jql?: string;
}): Promise<
  | { ok: true; issues: JiraIssueImportRow[]; config: JiraConfig; jql: string }
  | { ok: false; error: string }
> {
  const loaded = await loadJiraConfig({ requireEnabled: false });
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

    // Enhanced search API (legacy /rest/api/3/search returns 410 Gone).
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
