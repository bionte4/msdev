"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { mergePerms } from "@/lib/effective-roles";
import type { Role } from "@/lib/constants";
import {
  createProjectSchema,
  deactivateProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type DeactivateProjectInput,
  type UpdateProjectInput,
} from "@/lib/validations/projects";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface ProjectItem {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  name: string;
  code: string;
  isActive: boolean;
  timesheetCount: number;
  scopeSwapCount: number;
  canEdit: boolean;
  canDeactivate: boolean;
}

export interface ProjectClientOption {
  id: string;
  name: string;
  code: string;
}

export interface ProjectPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
}

function projectPerms(role: Role): ProjectPermissions {
  const manage =
    role === "SYS_ADMIN" || role === "CLIENT_PM" || role === "VENDOR_LEAD";
  return {
    canCreate: manage,
    canEdit: manage,
    canDeactivate: manage,
  };
}

function mapProject(
  row: {
    id: string;
    clientId: string;
    name: string;
    code: string;
    isActive: boolean;
    client: { name: string; code: string };
    _count: { timesheets: number; scopeSwaps: number };
  },
  perms: ProjectPermissions
): ProjectItem {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    clientCode: row.client.code,
    name: row.name,
    code: row.code,
    isActive: row.isActive,
    timesheetCount: row._count.timesheets,
    scopeSwapCount: row._count.scopeSwaps,
    canEdit: perms.canEdit,
    canDeactivate: perms.canDeactivate && row.isActive,
  };
}

function clientScopeWhere(session: NonNullable<Awaited<ReturnType<typeof auth>>>) {
  if (session.user.role === "SYS_ADMIN") return {};
  if (session.user.clientId) return { clientId: session.user.clientId };
  return { clientId: "__none__" };
}

async function assertProjectScope(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  projectId: string
): Promise<{ ok: true; project: { id: string; clientId: string; isActive: boolean } } | { ok: false; error: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, isActive: true },
  });
  if (!project) return { ok: false, error: "Project not found" };
  if (
    session.user.role !== "SYS_ADMIN" &&
    session.user.clientId &&
    project.clientId !== session.user.clientId
  ) {
    return { ok: false, error: "Unauthorized: project belongs to another client" };
  }
  return { ok: true, project };
}

export async function listProjects(): Promise<
  ActionResult<{
    items: ProjectItem[];
    permissions: ProjectPermissions;
    clients: ProjectClientOption[];
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

    const perms = mergePerms(session.user.role, session.user.engagementMode, projectPerms);

    const [rows, clients] = await Promise.all([
      prisma.project.findMany({
        where: clientScopeWhere(session),
        include: {
          client: { select: { name: true, code: true } },
          _count: { select: { timesheets: true, scopeSwaps: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      session.user.role === "SYS_ADMIN"
        ? prisma.client.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true, code: true },
          })
        : session.user.clientId
          ? prisma.client.findMany({
              where: { id: session.user.clientId },
              select: { id: true, name: true, code: true },
            })
          : Promise.resolve([]),
    ]);

    return ok({
      items: rows.map((r) => mapProject(r, perms)),
      permissions: perms,
      clients,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list projects";
    return fail(message);
  }
}

export async function createProject(
  input: CreateProjectInput
): Promise<ActionResult<ProjectItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD"]);

    const perms = mergePerms(session.user.role, session.user.engagementMode, projectPerms);
    if (!perms.canCreate) return fail("Unauthorized to create project");

    const parsed = createProjectSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid project data");
    }

    const clientId =
      session.user.role === "SYS_ADMIN"
        ? parsed.data.clientId ?? session.user.clientId
        : session.user.clientId;

    if (!clientId) {
      return fail("Client context is required to create a project");
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return fail("Client not found");

    const code = parsed.data.code.toUpperCase();
    const duplicate = await prisma.project.findUnique({
      where: { clientId_code: { clientId, code } },
    });
    if (duplicate) {
      return fail(`Project code “${code}” already exists for this client`);
    }

    const created = await prisma.project.create({
      data: {
        clientId,
        name: parsed.data.name,
        code,
        isActive: parsed.data.isActive ?? true,
      },
      include: {
        client: { select: { name: true, code: true } },
        _count: { select: { timesheets: true, scopeSwaps: true } },
      },
    });

    return ok(mapProject(created, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create project";
    return fail(message);
  }
}

export async function updateProject(
  input: UpdateProjectInput
): Promise<ActionResult<ProjectItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD"]);

    const perms = mergePerms(session.user.role, session.user.engagementMode, projectPerms);
    if (!perms.canEdit) return fail("Unauthorized to edit project");

    const parsed = updateProjectSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid project data");
    }

    const scope = await assertProjectScope(session, parsed.data.id);
    if (!scope.ok) return fail(scope.error);

    const code = parsed.data.code.toUpperCase();
    const duplicate = await prisma.project.findFirst({
      where: {
        clientId: scope.project.clientId,
        code,
        NOT: { id: parsed.data.id },
      },
    });
    if (duplicate) {
      return fail(`Project code “${code}” already exists for this client`);
    }

    const updated = await prisma.project.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        code,
        isActive: parsed.data.isActive,
      },
      include: {
        client: { select: { name: true, code: true } },
        _count: { select: { timesheets: true, scopeSwaps: true } },
      },
    });

    return ok(mapProject(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update project";
    return fail(message);
  }
}

export async function deactivateProject(
  input: DeactivateProjectInput
): Promise<ActionResult<ProjectItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD"]);

    const perms = mergePerms(session.user.role, session.user.engagementMode, projectPerms);
    if (!perms.canDeactivate) return fail("Unauthorized to deactivate project");

    const parsed = deactivateProjectSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid deactivate request");

    const scope = await assertProjectScope(session, parsed.data.id);
    if (!scope.ok) return fail(scope.error);
    if (!scope.project.isActive) return fail("Project is already inactive");

    const updated = await prisma.project.update({
      where: { id: parsed.data.id },
      data: { isActive: false },
      include: {
        client: { select: { name: true, code: true } },
        _count: { select: { timesheets: true, scopeSwaps: true } },
      },
    });

    return ok(mapProject(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to deactivate project";
    return fail(message);
  }
}
