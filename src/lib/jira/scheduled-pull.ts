import { prisma } from "@/lib/prisma";
import {
  searchJiraIssues,
  type JiraIssueImportRow,
} from "@/lib/jira/client";
import type { TicketStatus, TicketWorkCategory } from "@/lib/validations/tickets";

export interface ProjectJiraPullResult {
  clientId: string;
  clientCode: string;
  projectId: string;
  projectCode: string;
  jiraProjectKey: string;
  imported: number;
  updated: number;
  skipped: number;
  unmatchedAssignee: number;
  keys: string[];
  errors: string[];
}

export interface ScheduledJiraPullResult {
  ranAt: string;
  companies: number;
  projects: number;
  imported: number;
  updated: number;
  skipped: number;
  results: ProjectJiraPullResult[];
  errors: string[];
}

function mapJiraStatusToPortal(
  statusName: string,
  statusCategory: string | null
): TicketStatus {
  const name = statusName.toLowerCase();
  const cat = (statusCategory ?? "").toLowerCase();
  if (
    cat === "done" ||
    name.includes("done") ||
    name.includes("closed") ||
    name.includes("resolved")
  ) {
    return "DONE";
  }
  if (
    name.includes("cancel") ||
    name.includes("won't") ||
    name.includes("wont")
  ) {
    return "CANCELLED";
  }
  if (
    cat === "indeterminate" ||
    name.includes("progress") ||
    name.includes("review") ||
    name.includes("doing")
  ) {
    return "IN_PROGRESS";
  }
  return "OPEN";
}

function parseJiraDate(value: string | null): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function resolveCronActorId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: "SYS_ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

/**
 * Pull Jira issues into one portal project (no session — for cron / shared import).
 */
export async function pullJiraIssuesIntoProject(input: {
  clientId: string;
  clientCode: string;
  projectId: string;
  projectCode: string;
  jiraProjectKey: string | null;
  createdById: string;
  category?: TicketWorkCategory;
  maxResults?: number;
  /** When true, refresh title/description/status for already-linked keys. */
  updateExisting?: boolean;
}): Promise<ProjectJiraPullResult> {
  const category = input.category ?? "DEVELOPMENT";
  const maxResults = Math.min(Math.max(input.maxResults ?? 50, 1), 100);
  const updateExisting = input.updateExisting ?? true;

  const empty: ProjectJiraPullResult = {
    clientId: input.clientId,
    clientCode: input.clientCode,
    projectId: input.projectId,
    projectCode: input.projectCode,
    jiraProjectKey: input.jiraProjectKey ?? "",
    imported: 0,
    updated: 0,
    skipped: 0,
    unmatchedAssignee: 0,
    keys: [],
    errors: [],
  };

  const searched = await searchJiraIssues({
    maxResults,
    scope: {
      clientId: input.clientId,
      projectKeyOverride: input.jiraProjectKey,
    },
  });

  if (!searched.ok) {
    return { ...empty, errors: [searched.error] };
  }

  empty.jiraProjectKey = searched.config.projectKey;

  if (searched.issues.length === 0) {
    return empty;
  }

  return upsertIssuesFromJira({
    clientId: input.clientId,
    clientCode: input.clientCode,
    projectId: input.projectId,
    projectCode: input.projectCode,
    jiraProjectKey: searched.config.projectKey,
    createdById: input.createdById,
    category,
    issues: searched.issues,
    updateExisting,
  });
}

async function upsertIssuesFromJira(input: {
  clientId: string;
  clientCode: string;
  projectId: string;
  projectCode: string;
  jiraProjectKey: string;
  createdById: string;
  category: TicketWorkCategory;
  issues: JiraIssueImportRow[];
  updateExisting: boolean;
}): Promise<ProjectJiraPullResult> {
  const keys = input.issues.map((i) => i.key);
  const existingRows = await prisma.operationalTicket.findMany({
    where: {
      clientId: input.clientId,
      jiraIssueKey: { in: keys },
    },
    select: {
      id: true,
      jiraIssueKey: true,
      projectId: true,
      title: true,
      description: true,
      status: true,
    },
  });
  const existingByKey = new Map(
    existingRows
      .filter((e) => e.jiraIssueKey)
      .map((e) => [e.jiraIssueKey!, e])
  );

  const developers = await prisma.developer.findMany({
    where: {
      clientId: input.clientId,
      isActive: true,
      OR: [
        { jiraAccountId: { not: null } },
        { jiraAccountEmail: { not: null } },
      ],
    },
    select: {
      id: true,
      jiraAccountId: true,
      jiraAccountEmail: true,
    },
  });

  const byAccountId = new Map(
    developers
      .filter((d) => d.jiraAccountId)
      .map((d) => [d.jiraAccountId!, d.id])
  );
  const byEmail = new Map(
    developers
      .filter((d) => d.jiraAccountEmail)
      .map((d) => [d.jiraAccountEmail!.toLowerCase(), d.id])
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let unmatchedAssignee = 0;
  const importedKeys: string[] = [];
  const errors: string[] = [];

  for (const issue of input.issues) {
    const existing = existingByKey.get(issue.key);
    const status = mapJiraStatusToPortal(
      issue.statusName,
      issue.statusCategory
    );

    if (existing) {
      if (!input.updateExisting) {
        skipped += 1;
        continue;
      }
      const sameProject = existing.projectId === input.projectId;
      const unchanged =
        existing.title === issue.summary.slice(0, 200) &&
        (existing.description ?? null) === (issue.description ?? null) &&
        existing.status === status;
      if (unchanged && sameProject) {
        skipped += 1;
        continue;
      }
      try {
        await prisma.operationalTicket.update({
          where: { id: existing.id },
          data: {
            title: issue.summary.slice(0, 200),
            description: issue.description,
            status,
            syncStatus: "SYNCED",
            syncMessage: `Pulled from Jira (${input.jiraProjectKey})`,
            syncToJira: true,
            jiraIssueId: issue.id,
          },
        });
        updated += 1;
      } catch (error) {
        errors.push(
          `${issue.key}: ${
            error instanceof Error ? error.message : "update failed"
          }`
        );
      }
      continue;
    }

    let assigneeId: string | null = null;
    if (issue.assigneeAccountId) {
      assigneeId = byAccountId.get(issue.assigneeAccountId) ?? null;
    }
    if (!assigneeId && issue.assigneeEmail) {
      assigneeId = byEmail.get(issue.assigneeEmail.toLowerCase()) ?? null;
    }

    const reporterName = assigneeId
      ? null
      : issue.assigneeDisplayName ?? "Jira scheduled pull";
    const reporterEmail = assigneeId ? null : issue.assigneeEmail ?? null;

    if (!assigneeId && issue.assigneeAccountId) {
      unmatchedAssignee += 1;
    }

    const workDate = parseJiraDate(issue.createdAt ?? issue.updatedAt);
    workDate.setHours(0, 0, 0, 0);

    try {
      await prisma.operationalTicket.create({
        data: {
          clientId: input.clientId,
          projectId: input.projectId,
          workDate,
          category: input.category,
          title: issue.summary.slice(0, 200),
          description: issue.description,
          status,
          assigneeId,
          reporterName,
          reporterEmail,
          createdById: input.createdById,
          syncToJira: true,
          jiraIssueKey: issue.key,
          jiraIssueId: issue.id,
          syncStatus: "SYNCED",
          syncMessage: `Scheduled pull from Jira (${input.jiraProjectKey})`,
          notes: [
            `Jira ${issue.key}`,
            issue.issueType ? `Type: ${issue.issueType}` : null,
            issue.labels.length
              ? `Labels: ${issue.labels.slice(0, 8).join(", ")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
      });
      existingByKey.set(issue.key, {
        id: "new",
        jiraIssueKey: issue.key,
        projectId: input.projectId,
        title: issue.summary,
        description: issue.description,
        status,
      });
      imported += 1;
      importedKeys.push(issue.key);
    } catch (error) {
      errors.push(
        `${issue.key}: ${
          error instanceof Error ? error.message : "create failed"
        }`
      );
    }
  }

  return {
    clientId: input.clientId,
    clientCode: input.clientCode,
    projectId: input.projectId,
    projectCode: input.projectCode,
    jiraProjectKey: input.jiraProjectKey,
    imported,
    updated,
    skipped,
    unmatchedAssignee,
    keys: importedKeys,
    errors,
  };
}

/**
 * Scheduled pull: every company with ClientJiraConfig → each active portal project.
 * Interval caller should invoke this every 15 minutes.
 */
export async function runScheduledJiraPull(options?: {
  maxResultsPerProject?: number;
}): Promise<ScheduledJiraPullResult> {
  const ranAt = new Date().toISOString();
  const maxResults = options?.maxResultsPerProject ?? 50;
  const errors: string[] = [];
  const results: ProjectJiraPullResult[] = [];

  const actorId = await resolveCronActorId();
  if (!actorId) {
    return {
      ranAt,
      companies: 0,
      projects: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      results: [],
      errors: ["No active SYS_ADMIN user to attribute pulled tickets"],
    };
  }

  const clientConfigs = await prisma.clientJiraConfig.findMany({
    include: {
      client: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          projects: {
            where: { isActive: true },
            select: {
              id: true,
              code: true,
              jiraProjectKey: true,
            },
            orderBy: { code: "asc" },
          },
        },
      },
    },
  });

  let companies = 0;

  for (const row of clientConfigs) {
    if (!row.client.isActive) continue;
    if (row.client.projects.length === 0) {
      errors.push(
        `${row.client.code}: no active portal projects — skip pull`
      );
      continue;
    }

    companies += 1;
    let companyImported = 0;
    let companyUpdated = 0;
    let companyErrors: string[] = [];

    for (const project of row.client.projects) {
      const result = await pullJiraIssuesIntoProject({
        clientId: row.client.id,
        clientCode: row.client.code,
        projectId: project.id,
        projectCode: project.code,
        jiraProjectKey: project.jiraProjectKey,
        createdById: actorId,
        maxResults,
        updateExisting: true,
      });
      results.push(result);
      companyImported += result.imported;
      companyUpdated += result.updated;
      if (result.errors.length) {
        companyErrors.push(...result.errors.map((e) => `${project.code}: ${e}`));
        errors.push(
          ...result.errors.map((e) => `${row.client.code}/${project.code}: ${e}`)
        );
      }
    }

    try {
      await prisma.clientJiraConfig.update({
        where: { id: row.id },
        data: {
          lastTestedAt: new Date(),
          lastTestMessage: `Scheduled pull ${ranAt}: +${companyImported} new · ~${companyUpdated} updated${
            companyErrors[0] ? ` · ${companyErrors[0]}` : ""
          }`,
        },
      });
    } catch {
      // non-fatal
    }
  }

  return {
    ranAt,
    companies,
    projects: results.length,
    imported: results.reduce((s, r) => s + r.imported, 0),
    updated: results.reduce((s, r) => s + r.updated, 0),
    skipped: results.reduce((s, r) => s + r.skipped, 0),
    results,
    errors,
  };
}
