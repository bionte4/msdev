"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import {
  createPersonnelSchema,
  deactivatePersonnelSchema,
  parseSkillTags,
  updatePersonnelSchema,
  type CreatePersonnelInput,
  type DeactivatePersonnelInput,
  type UpdatePersonnelInput,
} from "@/lib/validations/personnel";
import { toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface PersonnelItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  jobTitle: string;
  hourlyRate: number;
  standardCapacity: number;
  skillTags: string[];
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
}

export interface PersonnelPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
}

function personnelPerms(role: Role): PersonnelPermissions {
  const manage = role === "SYS_ADMIN" || role === "VENDOR_LEAD" || role === "VENDOR_AM";
  return {
    canCreate: manage,
    canEdit: manage,
    canDeactivate: manage,
  };
}

function mapPersonnel(
  row: {
    id: string;
    userId: string;
    hourlyRate: unknown;
    standardCapacity: unknown;
    jobTitle: string;
    skillTags: string[];
    startDate: Date | null;
    endDate: Date | null;
    notes: string | null;
    isActive: boolean;
    user: { name: string; email: string };
  },
  perms: PersonnelPermissions
): PersonnelItem {
  return {
    id: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    jobTitle: row.jobTitle,
    hourlyRate: toNumber(row.hourlyRate),
    standardCapacity: toNumber(row.standardCapacity),
    skillTags: row.skillTags,
    startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    notes: row.notes,
    isActive: row.isActive,
    canEdit: perms.canEdit,
    canDeactivate: perms.canDeactivate && row.isActive,
  };
}

export async function listPersonnel(): Promise<
  ActionResult<{ items: PersonnelItem[]; permissions: PersonnelPermissions }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "CLIENT_PM",
      "DEVELOPER",
    ]);

    const perms = personnelPerms(session.user.role);

    const rows = await prisma.developer.findMany({
      where: {
        ...(session.user.role === "DEVELOPER"
          ? { id: session.user.developerId ?? undefined }
          : session.user.role !== "SYS_ADMIN" && session.user.clientId
            ? { clientId: session.user.clientId }
            : {}),
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ isActive: "desc" }, { user: { name: "asc" } }],
    });

    return ok({
      items: rows.map((r) => mapPersonnel(r, perms)),
      permissions: perms,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list personnel";
    return fail(message);
  }
}

export async function createPersonnel(
  input: CreatePersonnelInput
): Promise<ActionResult<PersonnelItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);

    const perms = personnelPerms(session.user.role);
    if (!perms.canCreate) return fail("Unauthorized to add personnel");

    const parsed = createPersonnelSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid personnel data");
    }

    const clientId =
      session.user.role === "SYS_ADMIN"
        ? parsed.data.clientId ?? session.user.clientId
        : session.user.clientId;

    if (!clientId) {
      return fail("Client context is required to add personnel");
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return fail("Email is already registered");
    }

    const passwordHash = await hash(
      parsed.data.password ?? "password123",
      10
    );

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          role: "DEVELOPER",
          passwordHash,
          clientId,
        },
      });

      return tx.developer.create({
        data: {
          userId: user.id,
          clientId,
          hourlyRate: parsed.data.hourlyRate,
          standardCapacity: parsed.data.standardCapacity,
          jobTitle: parsed.data.jobTitle,
          skillTags: parseSkillTags(parsed.data.skillTags),
          startDate: parsed.data.startDate ?? new Date(),
          notes: parsed.data.notes,
          isActive: true,
        },
        include: { user: { select: { name: true, email: true } } },
      });
    });

    return ok(mapPersonnel(created, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create personnel";
    return fail(message);
  }
}

export async function updatePersonnel(
  input: UpdatePersonnelInput
): Promise<ActionResult<PersonnelItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);

    const perms = personnelPerms(session.user.role);
    if (!perms.canEdit) return fail("Unauthorized to edit personnel");

    const parsed = updatePersonnelSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid personnel data");
    }

    const existing = await prisma.developer.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Personnel not found");

    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      existing.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized: personnel belongs to another client");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.userId },
        data: { name: parsed.data.name },
      });

      return tx.developer.update({
        where: { id: existing.id },
        data: {
          jobTitle: parsed.data.jobTitle,
          hourlyRate: parsed.data.hourlyRate,
          standardCapacity: parsed.data.standardCapacity,
          skillTags: parseSkillTags(parsed.data.skillTags),
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
          notes: parsed.data.notes ?? null,
          isActive: parsed.data.isActive,
        },
        include: { user: { select: { name: true, email: true } } },
      });
    });

    return ok(mapPersonnel(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update personnel";
    return fail(message);
  }
}

export async function deactivatePersonnel(
  input: DeactivatePersonnelInput
): Promise<ActionResult<PersonnelItem>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);

    const perms = personnelPerms(session.user.role);
    if (!perms.canDeactivate) {
      return fail("Unauthorized to deactivate personnel");
    }

    const parsed = deactivatePersonnelSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid request");
    }

    const existing = await prisma.developer.findUnique({
      where: { id: parsed.data.id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!existing) return fail("Personnel not found");

    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      existing.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized: personnel belongs to another client");
    }

    const updated = await prisma.developer.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        endDate: parsed.data.endDate ?? new Date(),
      },
      include: { user: { select: { name: true, email: true } } },
    });

    return ok(mapPersonnel(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to deactivate personnel";
    return fail(message);
  }
}
