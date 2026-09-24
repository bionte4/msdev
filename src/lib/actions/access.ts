"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { mergePerms, hasEffectiveRole } from "@/lib/effective-roles";
import type { Role } from "@/lib/constants";
import { ALL_ROLES } from "@/lib/constants";
import {
  roleAllowsMultiClient,
  syncUserMemberships,
} from "@/lib/client-membership";
import {
  createAccessUserSchema,
  setAccessUserActiveSchema,
  updateAccessUserSchema,
  type CreateAccessUserInput,
  type SetAccessUserActiveInput,
  type UpdateAccessUserInput,
} from "@/lib/validations/access";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface AccessMembershipItem {
  id: string;
  name: string;
  code: string;
  isPrimary: boolean;
}

export interface AccessUserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  clientCode: string | null;
  memberships: AccessMembershipItem[];
  isActive: boolean;
  hasDeveloper: boolean;
  createdAt: string;
  canEdit: boolean;
  canDeactivate: boolean;
}

export interface AccessClientOption {
  id: string;
  name: string;
  code: string;
}

export interface AccessPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canAssignAnyRole: boolean;
  canAssignMultiClient: boolean;
}

function accessPerms(role: Role): AccessPermissions {
  return {
    canCreate: role === "SYS_ADMIN" || role === "VENDOR_LEAD",
    canEdit: role === "SYS_ADMIN" || role === "VENDOR_LEAD",
    canDeactivate: role === "SYS_ADMIN" || role === "VENDOR_LEAD",
    canAssignAnyRole: role === "SYS_ADMIN",
    canAssignMultiClient: role === "SYS_ADMIN",
  };
}

function mapUser(
  row: {
    id: string;
    name: string;
    email: string;
    role: Role;
    clientId: string | null;
    isActive: boolean;
    createdAt: Date;
    client: { name: string; code: string } | null;
    developer: { id: string } | null;
    memberships: {
      isPrimary: boolean;
      client: { id: string; name: string; code: string };
    }[];
  },
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  perms: AccessPermissions
): AccessUserItem {
  const isSelf = row.id === session.user.id;
  const isProtectedAdmin =
    row.role === "SYS_ADMIN" && session.user.role !== "SYS_ADMIN";

  const memberships: AccessMembershipItem[] = row.memberships.map((m) => ({
    id: m.client.id,
    name: m.client.name,
    code: m.client.code,
    isPrimary: m.isPrimary,
  }));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    clientCode: row.client?.code ?? null,
    memberships,
    isActive: row.isActive,
    hasDeveloper: Boolean(row.developer),
    createdAt: row.createdAt.toISOString(),
    canEdit: perms.canEdit && !isProtectedAdmin,
    canDeactivate: perms.canDeactivate && !isSelf && !isProtectedAdmin,
  };
}

const userInclude = {
  client: { select: { name: true, code: true } },
  developer: { select: { id: true } },
  memberships: {
    include: {
      client: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
  },
};

function resolveClientIds(input: {
  role: Role;
  clientId?: string | null;
  clientIds?: string[];
  primaryClientId?: string | null;
  actorIsAdmin: boolean;
  actorClientId: string | null | undefined;
}): { clientIds: string[]; primaryClientId: string | null } {
  if (input.role === "SYS_ADMIN") {
    return { clientIds: [], primaryClientId: null };
  }

  if (!input.actorIsAdmin) {
    const id = input.actorClientId;
    if (!id) throw new Error("Your account has no active client");
    return { clientIds: [id], primaryClientId: id };
  }

  const fromArray = (input.clientIds ?? []).filter(Boolean);
  const merged = Array.from(
    new Set([
      ...fromArray,
      ...(input.clientId ? [input.clientId] : []),
    ])
  );

  if (merged.length === 0) {
    throw new Error("Client is required for non-admin roles");
  }

  if (!roleAllowsMultiClient(input.role) && merged.length > 1) {
    return {
      clientIds: [merged[0]],
      primaryClientId: merged[0],
    };
  }

  const primary =
    (input.primaryClientId && merged.includes(input.primaryClientId)
      ? input.primaryClientId
      : null) ?? merged[0];

  return { clientIds: merged, primaryClientId: primary };
}

function validateRoleAssignment(
  actorRole: Role,
  engagementMode: string | null | undefined,
  targetRole: Role,
  clientIds: string[]
): string | null {
  if (targetRole !== "SYS_ADMIN" && clientIds.length === 0) {
    return "Client is required for non-admin roles";
  }
  if (targetRole === "SYS_ADMIN" && clientIds.length > 0) {
    return "SYS_ADMIN should not be tied to a client";
  }
  if (
    actorRole !== "SYS_ADMIN" &&
    hasEffectiveRole(actorRole, engagementMode, "VENDOR_LEAD")
  ) {
    const allowed: Role[] = ["VENDOR_LEAD", "VENDOR_AM", "DEVELOPER"];
    if (!allowed.includes(targetRole)) {
      return "Can only manage VENDOR_LEAD / VENDOR_AM / DEVELOPER for this client";
    }
  }
  return null;
}

export async function listAccessUsers(): Promise<
  ActionResult<{
    items: AccessUserItem[];
    permissions: AccessPermissions;
    clients: AccessClientOption[];
    roles: Role[];
  }>
> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      accessPerms
    );

    const isLeadScoped =
      session.user.role !== "SYS_ADMIN" &&
      hasEffectiveRole(
        session.user.role,
        session.user.engagementMode,
        "VENDOR_LEAD"
      );

    const activeClientId = session.user.clientId ?? "__none__";

    const where =
      session.user.role === "SYS_ADMIN"
        ? {}
        : {
            role: { in: ["VENDOR_LEAD", "VENDOR_AM", "DEVELOPER"] as Role[] },
            OR: [
              { clientId: activeClientId },
              { memberships: { some: { clientId: activeClientId } } },
            ],
          };

    const [rows, clients] = await Promise.all([
      prisma.user.findMany({
        where,
        include: userInclude,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      session.user.role === "SYS_ADMIN"
        ? prisma.client.findMany({
            where: { isActive: true },
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

    const roles: Role[] =
      session.user.role === "SYS_ADMIN"
        ? ALL_ROLES
        : isLeadScoped
          ? ["VENDOR_LEAD", "VENDOR_AM", "DEVELOPER"]
          : [];

    return ok({
      items: rows.map((r) =>
        mapUser({ ...r, role: r.role as Role }, session, perms)
      ),
      permissions: perms,
      clients,
      roles,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list users";
    return fail(message);
  }
}

export async function createAccessUser(
  input: CreateAccessUserInput
): Promise<ActionResult<AccessUserItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      accessPerms
    );
    if (!perms.canCreate) return fail("Unauthorized to create users");

    const parsed = createAccessUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid user data");
    }

    const role = parsed.data.role as Role;
    let resolved: { clientIds: string[]; primaryClientId: string | null };
    try {
      resolved = resolveClientIds({
        role,
        clientId: parsed.data.clientId,
        clientIds: parsed.data.clientIds,
        primaryClientId: parsed.data.primaryClientId,
        actorIsAdmin: session.user.role === "SYS_ADMIN",
        actorClientId: session.user.clientId,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Invalid clients");
    }

    const roleError = validateRoleAssignment(
      session.user.role,
      session.user.engagementMode,
      role,
      resolved.clientIds
    );
    if (roleError) return fail(roleError);

    if (!perms.canAssignAnyRole && role === "SYS_ADMIN") {
      return fail("Unauthorized to create SYS_ADMIN");
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });
    if (existing) return fail("Email is already registered");

    const passwordHash = await hash(parsed.data.password ?? "password123", 10);

    const created = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        role,
        clientId: resolved.primaryClientId,
        passwordHash,
        isActive: parsed.data.isActive ?? true,
      },
    });

    await syncUserMemberships({
      userId: created.id,
      role,
      clientIds: resolved.clientIds,
      primaryClientId: resolved.primaryClientId,
    });

    const withRelations = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      include: userInclude,
    });

    await prisma.notification.create({
      data: {
        userId: created.id,
        title: "Welcome to Governance Portal",
        body: `Your account was created with role ${role}. Default password may apply — change it after first login.`,
        href: "/dashboard",
        type: "INFO",
      },
    });

    return ok(
      mapUser(
        { ...withRelations, role: withRelations.role as Role },
        session,
        perms
      )
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create user";
    return fail(message);
  }
}

export async function updateAccessUser(
  input: UpdateAccessUserInput
): Promise<ActionResult<AccessUserItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      accessPerms
    );
    if (!perms.canEdit) return fail("Unauthorized to edit users");

    const parsed = updateAccessUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid user data");
    }

    const existing = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      include: { memberships: { select: { clientId: true } } },
    });
    if (!existing) return fail("User not found");

    if (session.user.role !== "SYS_ADMIN") {
      const sameClient =
        existing.clientId === session.user.clientId ||
        existing.memberships.some(
          (m) => m.clientId === session.user.clientId
        );
      if (existing.role === "SYS_ADMIN" || !sameClient) {
        return fail("Unauthorized to edit this user");
      }
    }

    const role = parsed.data.role as Role;
    let resolved: { clientIds: string[]; primaryClientId: string | null };
    try {
      resolved = resolveClientIds({
        role,
        clientId: parsed.data.clientId,
        clientIds: parsed.data.clientIds,
        primaryClientId: parsed.data.primaryClientId,
        actorIsAdmin: session.user.role === "SYS_ADMIN",
        actorClientId: session.user.clientId,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Invalid clients");
    }

    const roleError = validateRoleAssignment(
      session.user.role,
      session.user.engagementMode,
      role,
      resolved.clientIds
    );
    if (roleError) return fail(roleError);

    if (existing.id === session.user.id && !parsed.data.isActive) {
      return fail("You cannot deactivate your own account");
    }

    const passwordHash =
      parsed.data.password && parsed.data.password.length >= 8
        ? await hash(parsed.data.password, 10)
        : undefined;

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        role,
        clientId: resolved.primaryClientId,
        isActive: parsed.data.isActive,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    await syncUserMemberships({
      userId: existing.id,
      role,
      clientIds: resolved.clientIds,
      primaryClientId: resolved.primaryClientId,
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
      include: userInclude,
    });

    if (existing.role !== role || existing.isActive !== parsed.data.isActive) {
      await prisma.notification.create({
        data: {
          userId: updated.id,
          title: "Account access updated",
          body: `Your access was updated by an administrator. Role: ${role}. Status: ${parsed.data.isActive ? "Active" : "Inactive"}.`,
          href: "/dashboard",
          type: "WARNING",
        },
      });
    }

    return ok(
      mapUser({ ...updated, role: updated.role as Role }, session, perms)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update user";
    return fail(message);
  }
}

export async function setAccessUserActive(
  input: SetAccessUserActiveInput
): Promise<ActionResult<AccessUserItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);
    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      accessPerms
    );
    if (!perms.canDeactivate) return fail("Unauthorized");

    const parsed = setAccessUserActiveSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid request");

    if (parsed.data.id === session.user.id) {
      return fail("You cannot change your own active status here");
    }

    const existing = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      include: { memberships: { select: { clientId: true } } },
    });
    if (!existing) return fail("User not found");

    if (session.user.role !== "SYS_ADMIN") {
      const sameClient =
        existing.clientId === session.user.clientId ||
        existing.memberships.some(
          (m) => m.clientId === session.user.clientId
        );
      if (existing.role === "SYS_ADMIN" || !sameClient) {
        return fail("Unauthorized to update this user");
      }
    }

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { isActive: parsed.data.isActive },
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: parsed.data.id },
      include: userInclude,
    });

    await prisma.notification.create({
      data: {
        userId: updated.id,
        title: parsed.data.isActive
          ? "Account reactivated"
          : "Account deactivated",
        body: parsed.data.isActive
          ? "Your portal access has been restored."
          : "Your portal access has been deactivated. Contact your administrator.",
        href: "/dashboard",
        type: parsed.data.isActive ? "SUCCESS" : "ALERT",
      },
    });

    return ok(
      mapUser({ ...updated, role: updated.role as Role }, session, perms)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update access";
    return fail(message);
  }
}
