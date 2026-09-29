"use server";

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { mergePerms } from "@/lib/effective-roles";
import type { Role } from "@/lib/constants";
import {
  createJiraIssue,
  searchJiraIssues,
  transitionJiraIssue,
  updateJiraIssue,
} from "@/lib/jira/client";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_IMPORT_HEADERS,
  TICKET_STATUS_LABELS,
  bulkImportTicketsSchema,
  createTicketSchema,
  deleteTicketSchema,
  importJiraTicketsSchema,
  listTicketsSchema,
  syncTicketToJiraSchema,
  updateTicketSchema,
  type BulkImportTicketsInput,
  type CreateTicketInput,
  type DeleteTicketInput,
  type ImportJiraTicketsInput,
  type ListTicketsInput,
  type SyncTicketToJiraInput,
  type TicketStatus,
  type TicketWorkCategory,
  type UpdateTicketInput,
} from "@/lib/validations/tickets";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface TicketPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canImport: boolean;
  canSyncJira: boolean;
}

export interface TicketProjectOption {
  id: string;
  name: string;
  code: string;
}

export interface TicketAssigneeOption {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
}

export interface TicketItem {
  id: string;
  workDate: string;
  category: TicketWorkCategory;
  categoryLabel: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  statusLabel: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  syncToJira: boolean;
  jiraIssueKey: string | null;
  syncStatus: string;
  syncMessage: string | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TicketListData {
  items: TicketItem[];
  permissions: TicketPermissions;
  from: string;
  to: string;
}

export interface TicketImportResult {
  created: number;
  failed: number;
  synced: number;
  errors: { row: number; message: string }[];
}

export interface JiraImportResult {
  imported: number;
  skipped: number;
  unmatchedAssignee: number;
  jiraProjectKey: string;
  jql: string;
  keys: string[];
  errors: string[];
}

function ticketPerms(role: Role): TicketPermissions {
  const staff =
    role === "SYS_ADMIN" ||
    role === "CLIENT_PM" ||
    role === "VENDOR_LEAD" ||
    role === "VENDOR_AM" ||
    role === "DEVELOPER";
  return {
    canCreate: staff,
    canEdit: staff,
    canDelete:
      role === "SYS_ADMIN" ||
      role === "CLIENT_PM" ||
      role === "VENDOR_LEAD",
    canImport: staff,
    canSyncJira:
      role === "SYS_ADMIN" ||
      role === "CLIENT_PM" ||
      role === "VENDOR_LEAD" ||
      role === "VENDOR_AM",
  };
}

function clientScopeWhere(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>
): Record<string, unknown> {
  if (session.user.role === "SYS_ADMIN") return {};
  if (session.user.clientId) return { clientId: session.user.clientId };
  return { clientId: "__none__" };
}

function monthBounds(ref = new Date()): { from: Date; to: Date } {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
  from.setHours(0, 0, 0, 0);
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapTicket(
  row: {
    id: string;
    workDate: Date;
    category: string;
    title: string;
    description: string | null;
    status: string;
    projectId: string;
    syncToJira: boolean;
    jiraIssueKey: string | null;
    syncStatus: string;
    syncMessage: string | null;
    notes: string | null;
    reporterName: string | null;
    reporterEmail: string | null;
    createdAt: Date;
    assigneeId: string | null;
    project: { name: string; code: string };
    assignee: {
      user: { name: string; email: string };
    } | null;
    createdBy: { name: string };
  },
  perms: TicketPermissions
): TicketItem {
  const category = row.category as TicketWorkCategory;
  const status = row.status as TicketStatus;
  return {
    id: row.id,
    workDate: isoDate(row.workDate),
    category,
    categoryLabel: TICKET_CATEGORY_LABELS[category] ?? category,
    title: row.title,
    description: row.description,
    status,
    statusLabel: TICKET_STATUS_LABELS[status] ?? status,
    projectId: row.projectId,
    projectName: row.project.name,
    projectCode: row.project.code,
    assigneeId: row.assigneeId,
    assigneeName: row.assignee?.user.name ?? null,
    assigneeEmail: row.assignee?.user.email ?? null,
    reporterName: row.reporterName,
    reporterEmail: row.reporterEmail,
    syncToJira: row.syncToJira,
    jiraIssueKey: row.jiraIssueKey,
    syncStatus: row.syncStatus,
    syncMessage: row.syncMessage,
    notes: row.notes,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
    canEdit: perms.canEdit,
    canDelete: perms.canDelete,
  };
}

const ticketInclude = {
  project: { select: { name: true, code: true, jiraProjectKey: true } },
  assignee: {
    select: { user: { select: { name: true, email: true } } },
  },
  createdBy: { select: { name: true } },
} as const;

async function assertProjectInScope(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  projectId: string
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      clientId: true,
      isActive: true,
      name: true,
      code: true,
      jiraProjectKey: true,
    },
  });
  if (!project || !project.isActive) {
    throw new Error("Project not found or inactive");
  }
  if (
    session.user.role !== "SYS_ADMIN" &&
    session.user.clientId &&
    project.clientId !== session.user.clientId
  ) {
    throw new Error("Project is outside your company scope");
  }
  return project;
}

async function resolveAssignee(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  assigneeId: string | null | undefined
) {
  if (!assigneeId) return null;
  const developer = await prisma.developer.findUnique({
    where: { id: assigneeId },
    select: {
      id: true,
      clientId: true,
      isActive: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!developer || !developer.isActive) {
    throw new Error("Assignee not found or inactive");
  }
  if (
    session.user.role !== "SYS_ADMIN" &&
    session.user.clientId &&
    developer.clientId !== session.user.clientId
  ) {
    throw new Error("Assignee is outside your company scope");
  }
  if (
    session.user.role === "DEVELOPER" &&
    session.user.developerId &&
    developer.id !== session.user.developerId
  ) {
    throw new Error("Developers can only assign themselves");
  }
  return developer;
}

async function pushTicketToJira(
  ticket: {
    id: string;
    clientId: string;
    title: string;
    description: string | null;
    category: string;
    project: { code: string; jiraProjectKey?: string | null };
    workDate: Date;
  }
): Promise<{
  syncStatus: "SYNCED" | "FAILED" | "SKIPPED";
  jiraIssueKey: string | null;
  jiraIssueId: string | null;
  syncMessage: string | null;
}> {
  const scope = {
    clientId: ticket.clientId,
    projectKeyOverride: ticket.project.jiraProjectKey ?? null,
  };
  const result = await createJiraIssue(
    {
      summary: `[${ticket.project.code}] ${ticket.title}`,
      description: [
        ticket.description ?? "",
        "",
        `Category: ${ticket.category}`,
        `Work date: ${isoDate(ticket.workDate)}`,
        `Portal ticket: ${ticket.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      labels: ["governance-portal", ticket.category.toLowerCase()],
    },
    scope
  );

  if (!result.ok) {
    return {
      syncStatus: "FAILED",
      jiraIssueKey: null,
      jiraIssueId: null,
      syncMessage: result.error,
    };
  }

  return {
    syncStatus: "SYNCED",
    jiraIssueKey: result.key,
    jiraIssueId: result.id,
    syncMessage: `Synced to ${result.config.projectKey}`,
  };
}

async function pushTicketUpdateToJira(ticket: {
  id: string;
  clientId: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  jiraIssueKey: string;
  project: { code: string; jiraProjectKey?: string | null };
  workDate: Date;
}): Promise<{
  syncStatus: "SYNCED" | "FAILED";
  syncMessage: string | null;
}> {
  const scope = {
    clientId: ticket.clientId,
    projectKeyOverride: ticket.project.jiraProjectKey ?? null,
  };
  const summary = `[${ticket.project.code}] ${ticket.title}`;
  const description = [
    ticket.description ?? "",
    "",
    `Category: ${ticket.category}`,
    `Status: ${ticket.status}`,
    `Work date: ${isoDate(ticket.workDate)}`,
    `Portal ticket: ${ticket.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  const updated = await updateJiraIssue(
    {
      issueKey: ticket.jiraIssueKey,
      summary,
      description,
      labels: ["governance-portal", ticket.category.toLowerCase()],
    },
    scope
  );

  if (!updated.ok) {
    return { syncStatus: "FAILED", syncMessage: updated.error };
  }

  const status = ticket.status as TicketStatus;
  const transition = await transitionJiraIssue(
    {
      issueKey: ticket.jiraIssueKey,
      portalStatus: status,
    },
    scope
  );

  if (!transition.ok) {
    return {
      syncStatus: "SYNCED",
      syncMessage: `Updated ${ticket.jiraIssueKey}; status not changed (${transition.error})`,
    };
  }

  if (transition.transitioned) {
    return {
      syncStatus: "SYNCED",
      syncMessage: `Updated ${ticket.jiraIssueKey} · status → ${transition.name}`,
    };
  }

  return {
    syncStatus: "SYNCED",
    syncMessage: `Updated ${ticket.jiraIssueKey} (fields; no matching Jira transition for ${ticket.status})`,
  };
}

export async function listTickets(
  input: ListTicketsInput = {}
): Promise<ActionResult<TicketListData>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );

    const parsed = listTicketsSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid filter");
    }

    const defaults = monthBounds();
    const from = parsed.data.from ?? defaults.from;
    const to = parsed.data.to ?? defaults.to;
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      ...clientScopeWhere(session),
      workDate: { gte: from, lte: to },
    };
    if (parsed.data.projectId) where.projectId = parsed.data.projectId;
    if (parsed.data.category) where.category = parsed.data.category;
    if (parsed.data.status) where.status = parsed.data.status;

    if (session.user.role === "DEVELOPER" && session.user.developerId) {
      where.OR = [
        { assigneeId: session.user.developerId },
        { createdById: session.user.id },
      ];
    }

    const rows = await prisma.operationalTicket.findMany({
      where,
      include: ticketInclude,
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    return ok({
      items: rows.map((r) => mapTicket(r, perms)),
      permissions: perms,
      from: isoDate(from),
      to: isoDate(to),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list tickets";
    return fail(message);
  }
}

export async function getTicketFormOptions(): Promise<
  ActionResult<{
    projects: TicketProjectOption[];
    assignees: TicketAssigneeOption[];
    permissions: TicketPermissions;
  }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );

    const projectWhere = {
      isActive: true,
      ...clientScopeWhere(session),
    };

    const developerWhere =
      session.user.role === "DEVELOPER" && session.user.developerId
        ? { id: session.user.developerId, isActive: true }
        : { isActive: true, ...clientScopeWhere(session) };

    const [projects, developers] = await Promise.all([
      prisma.project.findMany({
        where: projectWhere,
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true },
      }),
      prisma.developer.findMany({
        where: developerWhere,
        orderBy: { user: { name: "asc" } },
        select: {
          id: true,
          jobTitle: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    return ok({
      projects,
      assignees: developers.map((d) => ({
        id: d.id,
        name: d.user.name,
        email: d.user.email,
        jobTitle: d.jobTitle,
      })),
      permissions: perms,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load form options";
    return fail(message);
  }
}

export async function createTicket(
  input: CreateTicketInput
): Promise<ActionResult<TicketItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canCreate) return fail("Unauthorized to create tickets");

    const parsed = createTicketSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid ticket");
    }

    const project = await assertProjectInScope(session, parsed.data.projectId);
    let assigneeId = parsed.data.assigneeId || null;
    if (session.user.role === "DEVELOPER" && session.user.developerId) {
      assigneeId = session.user.developerId;
    }
    await resolveAssignee(session, assigneeId);

    const created = await prisma.operationalTicket.create({
      data: {
        clientId: project.clientId,
        projectId: project.id,
        workDate: parsed.data.workDate,
        category: parsed.data.category,
        title: parsed.data.title.trim(),
        description: parsed.data.description?.trim() || null,
        status: parsed.data.status,
        assigneeId,
        reporterName: parsed.data.reporterName?.trim() || null,
        reporterEmail: parsed.data.reporterEmail || null,
        createdById: session.user.id,
        syncToJira: parsed.data.syncToJira,
        notes: parsed.data.notes?.trim() || null,
        syncStatus: parsed.data.syncToJira ? "NOT_SYNCED" : "SKIPPED",
      },
      include: ticketInclude,
    });

    if (parsed.data.syncToJira && perms.canSyncJira) {
      const sync = await pushTicketToJira(created);
      const updated = await prisma.operationalTicket.update({
        where: { id: created.id },
        data: sync,
        include: ticketInclude,
      });
      return ok(mapTicket(updated, perms));
    }

    return ok(mapTicket(created, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create ticket";
    return fail(message);
  }
}

export async function updateTicket(
  input: UpdateTicketInput
): Promise<ActionResult<TicketItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canEdit) return fail("Unauthorized to edit tickets");

    const parsed = updateTicketSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid ticket");
    }

    const existing = await prisma.operationalTicket.findUnique({
      where: { id: parsed.data.id },
      include: { project: { select: { code: true } } },
    });
    if (!existing) return fail("Ticket not found");

    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      existing.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized for this ticket");
    }

    if (
      session.user.role === "DEVELOPER" &&
      session.user.developerId &&
      existing.assigneeId !== session.user.developerId &&
      existing.createdById !== session.user.id
    ) {
      return fail("Unauthorized for this ticket");
    }

    const project = await assertProjectInScope(session, parsed.data.projectId);
    let assigneeId = parsed.data.assigneeId || null;
    if (session.user.role === "DEVELOPER" && session.user.developerId) {
      assigneeId = session.user.developerId;
    }
    await resolveAssignee(session, assigneeId);

    let updated = await prisma.operationalTicket.update({
      where: { id: existing.id },
      data: {
        clientId: project.clientId,
        projectId: project.id,
        workDate: parsed.data.workDate,
        category: parsed.data.category,
        title: parsed.data.title.trim(),
        description: parsed.data.description?.trim() || null,
        status: parsed.data.status,
        assigneeId,
        reporterName: parsed.data.reporterName?.trim() || null,
        reporterEmail: parsed.data.reporterEmail || null,
        syncToJira: parsed.data.syncToJira,
        notes: parsed.data.notes?.trim() || null,
      },
      include: ticketInclude,
    });

    const shouldPush =
      Boolean(existing.jiraIssueKey) &&
      (parsed.data.syncToJira || existing.syncToJira) &&
      perms.canSyncJira;

    if (shouldPush && existing.jiraIssueKey) {
      const sync = await pushTicketUpdateToJira({
        id: updated.id,
        clientId: updated.clientId,
        title: updated.title,
        description: updated.description,
        category: updated.category,
        status: updated.status,
        jiraIssueKey: existing.jiraIssueKey,
        project: {
          code: updated.project.code,
          jiraProjectKey: updated.project.jiraProjectKey,
        },
        workDate: updated.workDate,
      });
      updated = await prisma.operationalTicket.update({
        where: { id: updated.id },
        data: {
          syncStatus: sync.syncStatus,
          syncMessage: sync.syncMessage,
          syncToJira: true,
        },
        include: ticketInclude,
      });
    }

    return ok(mapTicket(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update ticket";
    return fail(message);
  }
}

export async function deleteTicket(
  input: DeleteTicketInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canDelete) return fail("Unauthorized to delete tickets");

    const parsed = deleteTicketSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid request");

    const existing = await prisma.operationalTicket.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Ticket not found");
    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      existing.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized for this ticket");
    }

    await prisma.operationalTicket.delete({ where: { id: existing.id } });
    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete ticket";
    return fail(message);
  }
}

export async function syncTicketToJira(
  input: SyncTicketToJiraInput
): Promise<ActionResult<TicketItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canSyncJira) return fail("Unauthorized to sync Jira");

    const parsed = syncTicketToJiraSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid request");

    const existing = await prisma.operationalTicket.findUnique({
      where: { id: parsed.data.id },
      include: {
        project: { select: { code: true, jiraProjectKey: true } },
      },
    });
    if (!existing) return fail("Ticket not found");
    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      existing.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized for this ticket");
    }

    if (existing.jiraIssueKey) {
      const sync = await pushTicketUpdateToJira({
        id: existing.id,
        clientId: existing.clientId,
        title: existing.title,
        description: existing.description,
        category: existing.category,
        status: existing.status,
        jiraIssueKey: existing.jiraIssueKey,
        project: existing.project,
        workDate: existing.workDate,
      });
      const updated = await prisma.operationalTicket.update({
        where: { id: existing.id },
        data: {
          ...sync,
          syncToJira: true,
        },
        include: ticketInclude,
      });
      if (sync.syncStatus === "FAILED") {
        return fail(sync.syncMessage ?? "Jira update failed");
      }
      return ok(mapTicket(updated, perms));
    }

    const sync = await pushTicketToJira(existing);
    const updated = await prisma.operationalTicket.update({
      where: { id: existing.id },
      data: {
        ...sync,
        syncToJira: true,
      },
      include: ticketInclude,
    });

    if (sync.syncStatus === "FAILED") {
      return fail(sync.syncMessage ?? "Jira sync failed");
    }

    return ok(mapTicket(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync ticket";
    return fail(message);
  }
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

/**
 * Pull existing Jira issues into portal tickets (dedupe by jiraIssueKey).
 * Assignee matched via Developer.jiraAccountId / jiraAccountEmail when linked.
 */
export async function importTicketsFromJira(
  input: ImportJiraTicketsInput
): Promise<ActionResult<JiraImportResult>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canSyncJira) {
      return fail("Unauthorized to import from Jira");
    }

    const parsed = importJiraTicketsSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid import request");
    }

    const project = await assertProjectInScope(session, parsed.data.projectId);
    const clientId = project.clientId;

    const searched = await searchJiraIssues({
      maxResults: parsed.data.maxResults,
      jql: parsed.data.jql ?? undefined,
      scope: {
        clientId,
        projectKeyOverride: project.jiraProjectKey,
      },
    });
    if (!searched.ok) return fail(searched.error);

    if (searched.issues.length === 0) {
      return ok({
        imported: 0,
        skipped: 0,
        unmatchedAssignee: 0,
        jiraProjectKey: searched.config.projectKey,
        jql: searched.jql,
        keys: [],
        errors: ["No issues returned from Jira for this query"],
      });
    }

    const keys = searched.issues.map((i) => i.key);
    const existing = await prisma.operationalTicket.findMany({
      where: {
        clientId,
        jiraIssueKey: { in: keys },
      },
      select: { jiraIssueKey: true },
    });
    const existingKeys = new Set(
      existing.map((e) => e.jiraIssueKey).filter(Boolean) as string[]
    );

    const developers = await prisma.developer.findMany({
      where: {
        clientId,
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
    let skipped = 0;
    let unmatchedAssignee = 0;
    const importedKeys: string[] = [];
    const errors: string[] = [];

    for (const issue of searched.issues) {
      if (existingKeys.has(issue.key)) {
        skipped += 1;
        continue;
      }

      let assigneeId: string | null = null;
      if (issue.assigneeAccountId) {
        assigneeId = byAccountId.get(issue.assigneeAccountId) ?? null;
      }
      if (!assigneeId && issue.assigneeEmail) {
        assigneeId =
          byEmail.get(issue.assigneeEmail.toLowerCase()) ?? null;
      }

      const reporterName = assigneeId
        ? null
        : issue.assigneeDisplayName ?? "Jira import";
      const reporterEmail = assigneeId
        ? null
        : issue.assigneeEmail ?? null;

      if (!assigneeId && issue.assigneeAccountId) {
        unmatchedAssignee += 1;
      }

      const workDate = parseJiraDate(issue.createdAt ?? issue.updatedAt);
      workDate.setHours(0, 0, 0, 0);

      try {
        await prisma.operationalTicket.create({
          data: {
            clientId,
            projectId: project.id,
            workDate,
            category: parsed.data.category,
            title: issue.summary.slice(0, 200),
            description: issue.description,
            status: mapJiraStatusToPortal(
              issue.statusName,
              issue.statusCategory
            ),
            assigneeId,
            reporterName,
            reporterEmail,
            createdById: session.user.id,
            syncToJira: true,
            jiraIssueKey: issue.key,
            jiraIssueId: issue.id,
            syncStatus: "SYNCED",
            syncMessage: `Imported from Jira (${searched.config.projectKey})`,
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
        existingKeys.add(issue.key);
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

    return ok({
      imported,
      skipped,
      unmatchedAssignee,
      jiraProjectKey: searched.config.projectKey,
      jql: searched.jql,
      keys: importedKeys,
      errors,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to import tickets from Jira";
    return fail(message);
  }
}

export async function downloadTicketImportTemplate(): Promise<
  ActionResult<{ filename: string; base64: string }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canImport) return fail("Unauthorized");

    const project = await prisma.project.findFirst({
      where: { isActive: true, ...clientScopeWhere(session) },
      select: { code: true },
      orderBy: { name: "asc" },
    });

    const today = isoDate(new Date());
    const code = project?.code ?? "PORTAL";
    const sampleEmail = session.user.email ?? "developer@acme.example";

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [...TICKET_IMPORT_HEADERS],
      [
        today,
        code,
        "MANAGE_APPS",
        "Rotate app secrets",
        "Monthly secret rotation for SSO app",
        "OPEN",
        "",
        "App Ops Staff",
        "ops@acme.example",
        "No",
        "",
      ],
      [
        today,
        code,
        "DEVELOPMENT",
        "Fix login redirect",
        "Reproduce and patch redirect loop",
        "IN_PROGRESS",
        sampleEmail,
        "",
        "",
        "No",
        "",
      ],
      [
        today,
        code,
        "MANAGE_DEVICE",
        "MDM enroll laptop",
        "New hire device enrollment",
        "DONE",
        "",
        "Device Admin",
        "devices@acme.example",
        "No",
        "",
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Tickets");

    const instructions = XLSX.utils.aoa_to_sheet([
      ["Column", "Required", "Notes"],
      ["workDate", "Yes", "YYYY-MM-DD"],
      ["projectCode", "Yes", "Active project code"],
      [
        "category",
        "Yes",
        "DEVELOPMENT | MANAGE_APPS | MANAGE_DEVICE | SUPPORT | ACCESS | OTHER",
      ],
      ["title", "Yes", "Min 3 characters"],
      ["description", "No", ""],
      ["status", "No", "OPEN | IN_PROGRESS | DONE | CANCELLED (default OPEN)"],
      ["assigneeEmail", "No*", "Developer login email (dev work)"],
      ["reporterName", "No*", "Required if no assigneeEmail (non-dev staff)"],
      ["reporterEmail", "No", "Optional contact email"],
      ["syncToJira", "No", "Yes/No — push to Jira when Integrations Jira is ready"],
      ["notes", "No", ""],
      ["", "", "* Provide assigneeEmail and/or reporterName"],
    ]);
    XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    }) as Buffer;

    return ok({
      filename: "ticket-import-template.xlsx",
      base64: Buffer.from(buffer).toString("base64"),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build template";
    return fail(message);
  }
}

export async function bulkImportTickets(
  input: BulkImportTicketsInput
): Promise<ActionResult<TicketImportResult>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canImport) return fail("Unauthorized to import");

    const parsed = bulkImportTicketsSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid import data");
    }

    const projects = await prisma.project.findMany({
      where: { isActive: true, ...clientScopeWhere(session) },
      select: { id: true, code: true, clientId: true },
    });
    const projectByCode = new Map(
      projects.map((p) => [p.code.toUpperCase(), p])
    );

    const developers = await prisma.developer.findMany({
      where: { isActive: true, ...clientScopeWhere(session) },
      select: {
        id: true,
        clientId: true,
        user: { select: { email: true } },
      },
    });
    const developerByEmail = new Map(
      developers.map((d) => [d.user.email.toLowerCase(), d])
    );

    let created = 0;
    let failed = 0;
    let synced = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < parsed.data.rows.length; i++) {
      const row = parsed.data.rows[i];
      const rowNum = i + 2;
      try {
        const project = projectByCode.get(row.projectCode);
        if (!project) {
          throw new Error(`Unknown projectCode ${row.projectCode}`);
        }

        let assigneeId: string | null = null;
        if (row.assigneeEmail) {
          const dev = developerByEmail.get(row.assigneeEmail);
          if (!dev) {
            throw new Error(`Unknown assigneeEmail ${row.assigneeEmail}`);
          }
          if (dev.clientId !== project.clientId) {
            throw new Error("Assignee and project must share the same client");
          }
          assigneeId = dev.id;
        }

        if (session.user.role === "DEVELOPER" && session.user.developerId) {
          assigneeId = session.user.developerId;
        }

        const reporterName = row.reporterName?.trim() || null;
        if (!assigneeId && !reporterName) {
          throw new Error("Need assigneeEmail or reporterName");
        }

        if (row.reporterEmail) {
          const emailCheck = zEmail(row.reporterEmail);
          if (!emailCheck) throw new Error("Invalid reporterEmail");
        }

        const ticket = await prisma.operationalTicket.create({
          data: {
            clientId: project.clientId,
            projectId: project.id,
            workDate: row.workDate,
            category: row.category,
            title: row.title.trim(),
            description: row.description?.trim() || null,
            status: row.status,
            assigneeId,
            reporterName,
            reporterEmail: row.reporterEmail || null,
            createdById: session.user.id,
            syncToJira: Boolean(row.syncToJira),
            notes: row.notes?.trim() || null,
            syncStatus: row.syncToJira ? "NOT_SYNCED" : "SKIPPED",
          },
          include: {
            project: { select: { code: true, jiraProjectKey: true } },
          },
        });

        created += 1;

        if (row.syncToJira && perms.canSyncJira) {
          const sync = await pushTicketToJira(ticket);
          await prisma.operationalTicket.update({
            where: { id: ticket.id },
            data: sync,
          });
          if (sync.syncStatus === "SYNCED") synced += 1;
          if (sync.syncStatus === "FAILED") {
            errors.push({
              row: rowNum,
              message: sync.syncMessage ?? "Jira sync failed (ticket saved)",
            });
          }
        }
      } catch (e) {
        failed += 1;
        errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : "Row failed",
        });
      }
    }

    return ok({ created, failed, synced, errors });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import tickets";
    return fail(message);
  }
}

function zEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function bulkImportTicketsFromExcel(input: {
  base64: string;
}): Promise<ActionResult<TicketImportResult>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      ticketPerms
    );
    if (!perms.canImport) return fail("Unauthorized to import");

    if (!input.base64 || input.base64.length < 16) {
      return fail("Import file is empty");
    }

    const binary = Buffer.from(input.base64, "base64");
    const workbook = XLSX.read(binary, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return fail("Excel file has no sheets");

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    if (rawRows.length === 0) return fail("No data rows found");

    const normalized = rawRows.map((row) => {
      const get = (...keys: string[]) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== "") return row[key];
          const found = Object.keys(row).find(
            (k) => k.trim().toLowerCase() === key.toLowerCase()
          );
          if (found && row[found] !== undefined && row[found] !== "") {
            return row[found];
          }
        }
        return "";
      };
      return {
        workDate: get("workDate", "work_date", "date"),
        projectCode: String(get("projectCode", "project_code", "project")),
        category: String(get("category", "workCategory", "type")),
        title: String(get("title", "summary")),
        description: String(get("description", "desc") || "") || null,
        status: String(get("status") || "OPEN"),
        assigneeEmail: String(get("assigneeEmail", "assignee_email", "email") || "") || null,
        reporterName: String(get("reporterName", "reporter_name", "reporter") || "") || null,
        reporterEmail: String(get("reporterEmail", "reporter_email") || "") || null,
        syncToJira: get("syncToJira", "sync_to_jira", "jira"),
        notes: String(get("notes") || "") || null,
      };
    });

    const parsed = bulkImportTicketsSchema.safeParse({ rows: normalized });
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid import file format"
      );
    }

    return bulkImportTickets({ rows: parsed.data.rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import Excel";
    return fail(message);
  }
}

export async function getMonthlyTicketSummary(input?: {
  from?: Date;
  to?: Date;
}): Promise<
  ActionResult<{
    from: string;
    to: string;
    total: number;
    byCategory: { category: string; label: string; count: number }[];
    byStatus: { status: string; label: string; count: number }[];
    byProject: { project: string; code: string; count: number }[];
  }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const defaults = monthBounds();
    const from = input?.from ?? defaults.from;
    const to = input?.to ?? defaults.to;
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const where: Record<string, unknown> = {
      ...clientScopeWhere(session),
      workDate: { gte: from, lte: to },
    };
    if (session.user.role === "DEVELOPER" && session.user.developerId) {
      where.OR = [
        { assigneeId: session.user.developerId },
        { createdById: session.user.id },
      ];
    }

    const rows = await prisma.operationalTicket.findMany({
      where,
      select: {
        category: true,
        status: true,
        project: { select: { name: true, code: true } },
      },
    });

    const byCategoryMap = new Map<string, number>();
    const byStatusMap = new Map<string, number>();
    const byProjectMap = new Map<string, { project: string; code: string; count: number }>();

    for (const r of rows) {
      byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + 1);
      byStatusMap.set(r.status, (byStatusMap.get(r.status) ?? 0) + 1);
      const key = r.project.code;
      const prev = byProjectMap.get(key) ?? {
        project: r.project.name,
        code: r.project.code,
        count: 0,
      };
      prev.count += 1;
      byProjectMap.set(key, prev);
    }

    return ok({
      from: isoDate(from),
      to: isoDate(to),
      total: rows.length,
      byCategory: Array.from(byCategoryMap.entries()).map(([category, count]) => ({
        category,
        label: TICKET_CATEGORY_LABELS[category as TicketWorkCategory] ?? category,
        count,
      })),
      byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({
        status,
        label: TICKET_STATUS_LABELS[status as TicketStatus] ?? status,
        count,
      })),
      byProject: Array.from(byProjectMap.values()).sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build summary";
    return fail(message);
  }
}
