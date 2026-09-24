"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { mergePerms } from "@/lib/effective-roles";
import type { EngagementMode, Role } from "@/lib/constants";
import {
  createClientSchema,
  deactivateClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type DeactivateClientInput,
  type UpdateClientInput,
} from "@/lib/validations/clients";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface ClientItem {
  id: string;
  name: string;
  code: string;
  notes: string | null;
  isActive: boolean;
  engagementMode: EngagementMode;
  developerCount: number;
  projectCount: number;
  userCount: number;
  canEdit: boolean;
  canDeactivate: boolean;
}

export interface ClientPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
}

function clientPerms(role: Role): ClientPermissions {
  const admin = role === "SYS_ADMIN";
  return {
    canCreate: admin,
    canEdit: admin,
    canDeactivate: admin,
  };
}

function mapClient(
  row: {
    id: string;
    name: string;
    code: string;
    notes: string | null;
    isActive: boolean;
    engagementMode: EngagementMode;
    _count: { developers: number; projects: number; users: number };
  },
  perms: ClientPermissions
): ClientItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    notes: row.notes,
    isActive: row.isActive,
    engagementMode: row.engagementMode,
    developerCount: row._count.developers,
    projectCount: row._count.projects,
    userCount: row._count.users,
    canEdit: perms.canEdit,
    canDeactivate: perms.canDeactivate && row.isActive,
  };
}

export async function listClients(): Promise<
  ActionResult<{ items: ClientItem[]; permissions: ClientPermissions }>
> {
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
      clientPerms
    );
    const rows = await prisma.client.findMany({
      where:
        session.user.role === "SYS_ADMIN"
          ? undefined
          : session.user.clientId
            ? { id: session.user.clientId }
            : { id: "__none__" },
      include: {
        _count: {
          select: { developers: true, projects: true, users: true },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return ok({
      items: rows.map((r) => mapClient(r, perms)),
      permissions: perms,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list clients";
    return fail(message);
  }
}

export async function createClient(
  input: CreateClientInput
): Promise<ActionResult<ClientItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      clientPerms
    );
    if (!perms.canCreate) return fail("Unauthorized to create client");

    const parsed = createClientSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid client data");
    }

    const code = parsed.data.code.toUpperCase();
    const existing = await prisma.client.findUnique({ where: { code } });
    if (existing) return fail(`Client code “${code}” already exists`);

    const created = await prisma.client.create({
      data: {
        name: parsed.data.name,
        code,
        notes: parsed.data.notes || null,
        isActive: parsed.data.isActive ?? true,
        engagementMode: parsed.data.engagementMode ?? "MANAGED",
      },
      include: {
        _count: {
          select: { developers: true, projects: true, users: true },
        },
      },
    });

    return ok(mapClient(created, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create client";
    return fail(message);
  }
}

export async function updateClient(
  input: UpdateClientInput
): Promise<ActionResult<ClientItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      clientPerms
    );
    if (!perms.canEdit) return fail("Unauthorized to edit client");

    const parsed = updateClientSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid client data");
    }

    const existing = await prisma.client.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Client not found");

    const code = parsed.data.code.toUpperCase();
    const duplicate = await prisma.client.findFirst({
      where: { code, NOT: { id: parsed.data.id } },
    });
    if (duplicate) return fail(`Client code “${code}” already exists`);

    const updated = await prisma.client.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        code,
        notes: parsed.data.notes || null,
        isActive: parsed.data.isActive,
        engagementMode: parsed.data.engagementMode,
      },
      include: {
        _count: {
          select: { developers: true, projects: true, users: true },
        },
      },
    });

    return ok(mapClient(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update client";
    return fail(message);
  }
}

export async function deactivateClient(
  input: DeactivateClientInput
): Promise<ActionResult<ClientItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      clientPerms
    );
    if (!perms.canDeactivate) return fail("Unauthorized to deactivate client");

    const parsed = deactivateClientSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid deactivate request");

    const existing = await prisma.client.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Client not found");
    if (!existing.isActive) return fail("Client is already inactive");

    const updated = await prisma.client.update({
      where: { id: existing.id },
      data: { isActive: false },
      include: {
        _count: {
          select: { developers: true, projects: true, users: true },
        },
      },
    });

    return ok(mapClient(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to deactivate client";
    return fail(message);
  }
}
