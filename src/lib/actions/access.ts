"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { mergePerms, hasEffectiveRole } from "@/lib/effective-roles";
import type { Role } from "@/lib/constants";
import { ALL_ROLES } from "@/lib/constants";
import {
  createAccessUserSchema,
  setAccessUserActiveSchema,
  updateAccessUserSchema,
  type CreateAccessUserInput,
  type SetAccessUserActiveInput,
  type UpdateAccessUserInput,
} from "@/lib/validations/access";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface AccessUserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  clientCode: string | null;
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
}

function accessPerms(role: Role): AccessPermissions {
  return {
    canCreate: role === "SYS_ADMIN" || role === "VENDOR_LEAD",
    canEdit: role === "SYS_ADMIN" || role === "VENDOR_LEAD",
    canDeactivate: role === "SYS_ADMIN" || role === "VENDOR_LEAD",
    canAssignAnyRole: role === "SYS_ADMIN",
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
  },
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  perms: AccessPermissions
): AccessUserItem {
  const isSelf = row.id === session.user.id;
  const isProtectedAdmin =
    row.role === "SYS_ADMIN" && session.user.role !== "SYS_ADMIN";

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    clientCode: row.client?.code ?? null,
    isActive: row.isActive,
    hasDeveloper: Boolean(row.developer),
    createdAt: row.createdAt.toISOString(),
    canEdit: perms.canEdit && !isProtectedAdmin,
    canDeactivate: perms.canDeactivate && !isSelf && !isProtectedAdmin,
  };
}

function validateRoleAssignment(
  actorRole: Role,
  engagementMode: string | null | undefined,
  targetRole: Role,
  clientId: string | null | undefined
): string | null {
  if (targetRole !== "SYS_ADMIN" && !clientId) {
    return "Client is required for non-admin roles";
  }
  if (targetRole === "SYS_ADMIN" && clientId) {
    return "SYS_ADMIN should not be tied to a client";
  }
  // Vendor Lead and body-shopping Client PM (effective Lead) share this limit.
  if (
    actorRole !== "SYS_ADMIN" &&
    hasEffectiveRole(actorRole, engagementMode, "VENDOR_LEAD")
  ) {
    const allowed: Role[] = ["VENDOR_AM", "DEVELOPER", "VENDOR_LEAD"];
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
    const perms = mergePerms(session.user.role, session.user.engagementMode, accessPerms);

    const where =
      session.user.role === "SYS_ADMIN"
        ? {}
        : {
            clientId: session.user.clientId ?? "__none__",
            role: { in: ["VENDOR_LEAD", "VENDOR_AM", "DEVELOPER"] as Role[] },
          };

    const [rows, clients] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          client: { select: { name: true, code: true } },
          developer: { select: { id: true } },
        },
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
        : ["VENDOR_LEAD", "VENDOR_AM", "DEVELOPER"];

    return ok({
      items: rows.map((r) =>
        mapUser(
          { ...r, role: r.role as Role },
          session,
          perms
        )
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
    const perms = mergePerms(session.user.role, session.user.engagementMode, accessPerms);
    if (!perms.canCreate) return fail("Unauthorized to create users");

    const parsed = createAccessUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid user data");
    }

    const role = parsed.data.role as Role;
    const clientId =
      session.user.role === "SYS_ADMIN"
        ? role === "SYS_ADMIN"
          ? null
          : parsed.data.clientId || null
        : session.user.clientId;

    const roleError = validateRoleAssignment(
      session.user.role,
      session.user.engagementMode,
      role,
      clientId
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
        clientId,
        passwordHash,
        isActive: parsed.data.isActive ?? true,
      },
      include: {
        client: { select: { name: true, code: true } },
        developer: { select: { id: true } },
      },
    });

    await prisma.notification.create({
      data: {
        userId: created.id,
        title: "Welcome to Governance Portal",
        body: `Your account was created with role ${role}. Default password may apply — change it after first login.`,
        href: "/capacity",
        type: "INFO",
      },
    });

    return ok(
      mapUser({ ...created, role: created.role as Role }, session, perms)
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
    const perms = mergePerms(session.user.role, session.user.engagementMode, accessPerms);
    if (!perms.canEdit) return fail("Unauthorized to edit users");

    const parsed = updateAccessUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid user data");
    }

    const existing = await prisma.user.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("User not found");

    if (
      session.user.role !== "SYS_ADMIN" &&
      (existing.role === "SYS_ADMIN" ||
        existing.clientId !== session.user.clientId)
    ) {
      return fail("Unauthorized to edit this user");
    }

    const role = parsed.data.role as Role;
    const clientId =
      session.user.role === "SYS_ADMIN"
        ? role === "SYS_ADMIN"
          ? null
          : parsed.data.clientId || null
        : session.user.clientId;

    const roleError = validateRoleAssignment(
      session.user.role,
      session.user.engagementMode,
      role,
      clientId
    );
    if (roleError) return fail(roleError);

    if (
      existing.id === session.user.id &&
      !parsed.data.isActive
    ) {
      return fail("You cannot deactivate your own account");
    }

    const passwordHash =
      parsed.data.password && parsed.data.password.length >= 8
        ? await hash(parsed.data.password, 10)
        : undefined;

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        role,
        clientId,
        isActive: parsed.data.isActive,
        ...(passwordHash ? { passwordHash } : {}),
      },
      include: {
        client: { select: { name: true, code: true } },
        developer: { select: { id: true } },
      },
    });

    if (existing.role !== role || existing.isActive !== parsed.data.isActive) {
      await prisma.notification.create({
        data: {
          userId: updated.id,
          title: "Account access updated",
          body: `Your access was updated by an administrator. Role: ${role}. Status: ${parsed.data.isActive ? "Active" : "Inactive"}.`,
          href: "/capacity",
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
    const perms = mergePerms(session.user.role, session.user.engagementMode, accessPerms);
    if (!perms.canDeactivate) return fail("Unauthorized");

    const parsed = setAccessUserActiveSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid request");

    if (parsed.data.id === session.user.id) {
      return fail("You cannot change your own active status here");
    }

    const existing = await prisma.user.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("User not found");

    if (
      session.user.role !== "SYS_ADMIN" &&
      (existing.role === "SYS_ADMIN" ||
        existing.clientId !== session.user.clientId)
    ) {
      return fail("Unauthorized to update this user");
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { isActive: parsed.data.isActive },
      include: {
        client: { select: { name: true, code: true } },
        developer: { select: { id: true } },
      },
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
        href: "/capacity",
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
