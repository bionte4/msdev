"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import { mergePerms } from "@/lib/effective-roles";
import type { Role } from "@/lib/constants";
import {
  createPersonnelSchema,
  deactivatePersonnelSchema,
  linkJiraAccountSchema,
  parseSkillTags,
  unlinkJiraAccountSchema,
  updatePersonnelSchema,
  testPersonnelJiraSchema,
  type CreatePersonnelInput,
  type DeactivatePersonnelInput,
  type LinkJiraAccountInput,
  type TestPersonnelJiraInput,
  type UnlinkJiraAccountInput,
  type UpdatePersonnelInput,
} from "@/lib/validations/personnel";
import { toNumber } from "@/lib/utils";
import { verifyJiraUserByEmail } from "@/lib/jira/client";
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
  jiraAccountEmail: string | null;
  jiraAccountId: string | null;
  jiraLinkedAt: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canLinkJira: boolean;
}

export interface PersonnelPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canLinkJira: boolean;
  canLinkOwnJira: boolean;
}

function personnelPerms(role: Role): PersonnelPermissions {
  const manage =
    role === "SYS_ADMIN" || role === "VENDOR_LEAD" || role === "VENDOR_AM";
  return {
    canCreate: manage,
    canEdit: manage,
    canDeactivate: manage,
    canLinkJira: manage || role === "CLIENT_PM",
    canLinkOwnJira: role === "DEVELOPER",
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
    jiraAccountEmail: string | null;
    jiraAccountId: string | null;
    jiraLinkedAt: Date | null;
    startDate: Date | null;
    endDate: Date | null;
    notes: string | null;
    isActive: boolean;
    user: { name: string; email: string };
  },
  perms: PersonnelPermissions,
  currentDeveloperId: string | null
): PersonnelItem {
  const isSelf = Boolean(
    currentDeveloperId && row.id === currentDeveloperId
  );
  return {
    id: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    jobTitle: row.jobTitle,
    hourlyRate: toNumber(row.hourlyRate),
    standardCapacity: toNumber(row.standardCapacity),
    skillTags: row.skillTags,
    jiraAccountEmail: row.jiraAccountEmail,
    jiraAccountId: row.jiraAccountId,
    jiraLinkedAt: row.jiraLinkedAt?.toISOString() ?? null,
    startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    notes: row.notes,
    isActive: row.isActive,
    canEdit: perms.canEdit,
    canDeactivate: perms.canDeactivate && row.isActive,
    canLinkJira: perms.canLinkJira || (perms.canLinkOwnJira && isSelf),
  };
}

async function assertJiraEmailAvailable(
  email: string,
  excludeDeveloperId?: string
): Promise<string | null> {
  const existing = await prisma.developer.findFirst({
    where: {
      jiraAccountEmail: email,
      ...(excludeDeveloperId ? { NOT: { id: excludeDeveloperId } } : {}),
    },
    include: { user: { select: { name: true } } },
  });
  if (!existing) return null;
  return `Jira account “${email}” is already linked to ${existing.user.name}`;
}

async function assertPersonnelScope(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  developerId: string
): Promise<
  | {
      ok: true;
      developer: {
        id: string;
        clientId: string;
        userId: string;
      };
    }
  | { ok: false; error: string }
> {
  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
    select: { id: true, clientId: true, userId: true },
  });
  if (!developer) return { ok: false, error: "Personnel not found" };

  if (session.user.role === "DEVELOPER") {
    if (session.user.developerId !== developer.id) {
      return { ok: false, error: "Unauthorized: can only manage your own Jira link" };
    }
    return { ok: true, developer };
  }

  if (
    session.user.role !== "SYS_ADMIN" &&
    session.user.clientId &&
    developer.clientId !== session.user.clientId
  ) {
    return { ok: false, error: "Unauthorized: personnel belongs to another client" };
  }

  return { ok: true, developer };
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

    const perms = mergePerms(session.user.role, session.user.engagementMode, personnelPerms);

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
      items: rows.map((r) =>
        mapPersonnel(r, perms, session.user.developerId ?? null)
      ),
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

    const perms = mergePerms(session.user.role, session.user.engagementMode, personnelPerms);
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

    const jiraEmail = parsed.data.jiraAccountEmail ?? null;
    let jiraAccountId: string | null = null;
    if (jiraEmail) {
      const taken = await assertJiraEmailAvailable(jiraEmail);
      if (taken) return fail(taken);
      const verified = await verifyJiraUserByEmail(jiraEmail);
      if (!verified.ok) return fail(verified.error);
      jiraAccountId = verified.user.accountId;
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
          jiraAccountEmail: jiraEmail,
          jiraAccountId,
          jiraLinkedAt: jiraEmail ? new Date() : null,
          startDate: parsed.data.startDate ?? new Date(),
          notes: parsed.data.notes,
          isActive: true,
        },
        include: { user: { select: { name: true, email: true } } },
      });
    });

    return ok(
      mapPersonnel(created, perms, session.user.developerId ?? null)
    );
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

    const perms = mergePerms(session.user.role, session.user.engagementMode, personnelPerms);
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

    const jiraEmail = parsed.data.jiraAccountEmail ?? null;
    if (jiraEmail) {
      const taken = await assertJiraEmailAvailable(jiraEmail, existing.id);
      if (taken) return fail(taken);
    }

    const jiraChanged = (existing.jiraAccountEmail ?? null) !== jiraEmail;
    let nextJiraAccountId: string | null | undefined = undefined;
    let nextJiraLinkedAt: Date | null | undefined = undefined;

    if (jiraChanged) {
      if (jiraEmail) {
        const verified = await verifyJiraUserByEmail(jiraEmail);
        if (!verified.ok) return fail(verified.error);
        nextJiraAccountId = verified.user.accountId;
        nextJiraLinkedAt = new Date();
      } else {
        nextJiraAccountId = null;
        nextJiraLinkedAt = null;
      }
    } else if (jiraEmail && !existing.jiraAccountId) {
      // Re-verify previously stored email that never got an accountId.
      const verified = await verifyJiraUserByEmail(jiraEmail);
      if (!verified.ok) return fail(verified.error);
      nextJiraAccountId = verified.user.accountId;
      nextJiraLinkedAt = new Date();
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
          jiraAccountEmail: jiraEmail,
          ...(nextJiraAccountId !== undefined
            ? { jiraAccountId: nextJiraAccountId }
            : {}),
          ...(nextJiraLinkedAt !== undefined
            ? { jiraLinkedAt: nextJiraLinkedAt }
            : {}),
          startDate: parsed.data.startDate ?? null,
          endDate: parsed.data.endDate ?? null,
          notes: parsed.data.notes ?? null,
          isActive: parsed.data.isActive,
        },
        include: { user: { select: { name: true, email: true } } },
      });
    });

    return ok(
      mapPersonnel(updated, perms, session.user.developerId ?? null)
    );
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

    const perms = mergePerms(session.user.role, session.user.engagementMode, personnelPerms);
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

    return ok(
      mapPersonnel(updated, perms, session.user.developerId ?? null)
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to deactivate personnel";
    return fail(message);
  }
}

export async function linkJiraAccount(
  input: LinkJiraAccountInput
): Promise<ActionResult<PersonnelItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "CLIENT_PM",
      "DEVELOPER",
    ]);

    const perms = mergePerms(session.user.role, session.user.engagementMode, personnelPerms);
    const parsed = linkJiraAccountSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid Jira link");
    }

    const scope = await assertPersonnelScope(session, parsed.data.developerId);
    if (!scope.ok) return fail(scope.error);

    const isSelf = session.user.developerId === scope.developer.id;
    if (!perms.canLinkJira && !(perms.canLinkOwnJira && isSelf)) {
      return fail("Unauthorized to link Jira account");
    }

    const taken = await assertJiraEmailAvailable(
      parsed.data.jiraAccountEmail,
      scope.developer.id
    );
    if (taken) return fail(taken);

    const verified = await verifyJiraUserByEmail(parsed.data.jiraAccountEmail);
    if (!verified.ok) return fail(verified.error);

    const updated = await prisma.developer.update({
      where: { id: scope.developer.id },
      data: {
        jiraAccountEmail: parsed.data.jiraAccountEmail,
        jiraAccountId: verified.user.accountId,
        jiraLinkedAt: new Date(),
      },
      include: { user: { select: { name: true, email: true } } },
    });

    return ok(
      mapPersonnel(updated, perms, session.user.developerId ?? null)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to link Jira account";
    return fail(message);
  }
}

export async function unlinkJiraAccount(
  input: UnlinkJiraAccountInput
): Promise<ActionResult<PersonnelItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "CLIENT_PM",
      "DEVELOPER",
    ]);

    const perms = mergePerms(session.user.role, session.user.engagementMode, personnelPerms);
    const parsed = unlinkJiraAccountSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid unlink request");

    const scope = await assertPersonnelScope(session, parsed.data.developerId);
    if (!scope.ok) return fail(scope.error);

    const isSelf = session.user.developerId === scope.developer.id;
    if (!perms.canLinkJira && !(perms.canLinkOwnJira && isSelf)) {
      return fail("Unauthorized to unlink Jira account");
    }

    const updated = await prisma.developer.update({
      where: { id: scope.developer.id },
      data: {
        jiraAccountEmail: null,
        jiraAccountId: null,
        jiraLinkedAt: null,
      },
      include: { user: { select: { name: true, email: true } } },
    });

    return ok(
      mapPersonnel(updated, perms, session.user.developerId ?? null)
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to unlink Jira account";
    return fail(message);
  }
}

export interface PersonnelJiraTestResult {
  email: string;
  accountId: string;
  displayName: string;
  active: boolean;
  available: boolean;
  message: string;
}

/**
 * Live test: 1 developer ↔ 1 Jira account.
 * Checks roster uniqueness + Atlassian user lookup (no DB write).
 */
export async function testPersonnelJiraConnection(
  input: TestPersonnelJiraInput
): Promise<ActionResult<PersonnelJiraTestResult>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "CLIENT_PM",
      "DEVELOPER",
    ]);

    const perms = mergePerms(
      session.user.role,
      session.user.engagementMode,
      personnelPerms
    );
    const parsed = testPersonnelJiraSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid Jira email");
    }

    if (parsed.data.developerId) {
      const scope = await assertPersonnelScope(
        session,
        parsed.data.developerId
      );
      if (!scope.ok) return fail(scope.error);
      const isSelf = session.user.developerId === scope.developer.id;
      if (!perms.canLinkJira && !(perms.canLinkOwnJira && isSelf)) {
        return fail("Unauthorized to test Jira for this developer");
      }
    } else if (!perms.canLinkJira && !perms.canCreate) {
      return fail("Unauthorized to test Jira connection");
    }

    const taken = await assertJiraEmailAvailable(
      parsed.data.jiraAccountEmail,
      parsed.data.developerId
    );
    if (taken) {
      return fail(taken);
    }

    const verified = await verifyJiraUserByEmail(parsed.data.jiraAccountEmail);
    if (!verified.ok) return fail(verified.error);

    return ok({
      email: parsed.data.jiraAccountEmail,
      accountId: verified.user.accountId,
      displayName: verified.user.displayName,
      active: verified.user.active,
      available: true,
      message: `OK · ${verified.user.displayName} (${verified.user.accountId}) — free for this developer (1:1)`,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to test Jira connection";
    return fail(message);
  }
}
