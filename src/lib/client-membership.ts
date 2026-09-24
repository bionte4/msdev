import type { EngagementMode, Role } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
  roleAllowsMultiClient,
  type MembershipClientSummary,
} from "@/lib/membership-types";

export type { MembershipClientSummary } from "@/lib/membership-types";
export {
  MULTI_CLIENT_ROLES,
  roleAllowsMultiClient,
} from "@/lib/membership-types";

/**
 * Replace memberships for a user and keep User.clientId in sync as primary/active.
 * Pass empty clientIds for SYS_ADMIN (clears memberships + clientId).
 */
export async function syncUserMemberships(params: {
  userId: string;
  role: Role;
  clientIds: string[];
  primaryClientId?: string | null;
}): Promise<{ primaryClientId: string | null }> {
  const { userId, role } = params;
  let clientIds = Array.from(new Set(params.clientIds.filter(Boolean)));

  if (role === "SYS_ADMIN") {
    await prisma.clientMembership.deleteMany({ where: { userId } });
    await prisma.user.update({
      where: { id: userId },
      data: { clientId: null },
    });
    return { primaryClientId: null };
  }

  if (clientIds.length === 0) {
    throw new Error("At least one client membership is required");
  }

  if (!roleAllowsMultiClient(role) && clientIds.length > 1) {
    clientIds = [clientIds[0]];
  }

  const primary =
    (params.primaryClientId && clientIds.includes(params.primaryClientId)
      ? params.primaryClientId
      : null) ?? clientIds[0];

  const existingClients = await prisma.client.findMany({
    where: { id: { in: clientIds }, isActive: true },
    select: { id: true },
  });
  if (existingClients.length !== clientIds.length) {
    throw new Error("One or more clients are invalid or inactive");
  }

  await prisma.$transaction(async (tx) => {
    await tx.clientMembership.deleteMany({
      where: {
        userId,
        clientId: { notIn: clientIds },
      },
    });

    for (const clientId of clientIds) {
      await tx.clientMembership.upsert({
        where: {
          userId_clientId: { userId, clientId },
        },
        create: {
          userId,
          clientId,
          isPrimary: clientId === primary,
        },
        update: {
          isPrimary: clientId === primary,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: { clientId: primary },
    });
  });

  return { primaryClientId: primary };
}

export async function listMembershipsForUser(
  userId: string
): Promise<MembershipClientSummary[]> {
  const rows = await prisma.clientMembership.findMany({
    where: { userId, client: { isActive: true } },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          code: true,
          engagementMode: true,
        },
      },
    },
    orderBy: [{ isPrimary: "desc" }, { client: { name: "asc" } }],
  });

  return rows.map((r) => ({
    id: r.client.id,
    name: r.client.name,
    code: r.client.code,
    engagementMode: r.client.engagementMode as EngagementMode,
    isPrimary: r.isPrimary,
  }));
}

export async function userHasClientMembership(
  userId: string,
  clientId: string
): Promise<boolean> {
  const row = await prisma.clientMembership.findUnique({
    where: {
      userId_clientId: { userId, clientId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Ensure legacy users (clientId set, no membership row yet) get a backfilled row.
 */
export async function ensureMembershipBackfill(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      clientId: true,
      _count: { select: { memberships: true } },
    },
  });
  if (!user || user.role === "SYS_ADMIN") return;
  if (user._count.memberships > 0) return;
  if (!user.clientId) return;

  await prisma.clientMembership.create({
    data: {
      userId: user.id,
      clientId: user.clientId,
      isPrimary: true,
    },
  });
}
