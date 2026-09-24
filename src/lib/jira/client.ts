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
  return url.replace(/\/+$/, "");
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

export async function loadJiraConfig(): Promise<
  | { ok: true; config: JiraConfig; enabled: boolean }
  | { ok: false; error: string }
> {
  const row = await prisma.integrationConfig.findUnique({
    where: { provider: "JIRA" },
  });
  if (!row) {
    return {
      ok: false,
      error:
        "Jira integration is not configured. Ask SYS_ADMIN to set Integrations → Jira.",
    };
  }
  if (!row.enabled) {
    return {
      ok: false,
      error: "Jira integration is disabled. Enable it in Integrations first.",
    };
  }

  const raw =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};

  const parsed = jiraConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Jira config is incomplete (URL, email, API token, project key).",
    };
  }

  if (!parsed.data.apiToken || parsed.data.apiToken.includes("••••")) {
    return {
      ok: false,
      error: "Jira API token is missing. Re-save the token in Integrations.",
    };
  }

  return { ok: true, config: parsed.data, enabled: true };
}

export async function testJiraConnection(): Promise<
  JiraConnectionOk | JiraConnectionFail
> {
  const loaded = await loadJiraConfig();
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
    const loaded = await loadJiraConfig();
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
  const loaded = await loadJiraConfig();
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
