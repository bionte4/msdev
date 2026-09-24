"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import {
  assignDeveloperSkillSchema,
  deleteDeveloperSkillSchema,
  deleteSkillCatalogSchema,
  upsertSkillCatalogSchema,
  upsertSkillCategorySchema,
  type AssignDeveloperSkillInput,
  type DeleteDeveloperSkillInput,
  type DeleteSkillCatalogInput,
  type UpsertSkillCatalogInput,
  type UpsertSkillCategoryInput,
} from "@/lib/validations/skills";
import {
  deleteCoachingSchema,
  deletePerformanceActionSchema,
  deleteTrainingSchema,
  upsertCoachingSchema,
  upsertPerformanceActionSchema,
  upsertTrainingSchema,
  type UpsertCoachingInput,
  type UpsertPerformanceActionInput,
  type UpsertTrainingInput,
} from "@/lib/validations/development";
import { toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface DevelopmentPermissions {
  canManageCatalog: boolean;
  canAssignSkills: boolean;
  canManageTraining: boolean;
  canManageCoaching: boolean;
  canManagePerformance: boolean;
}

function perms(role: Role): DevelopmentPermissions {
  const lead = role === "VENDOR_LEAD" || role === "SYS_ADMIN";
  const pm = role === "CLIENT_PM";
  return {
    canManageCatalog: lead,
    canAssignSkills: lead || role === "VENDOR_AM" || role === "DEVELOPER",
    canManageTraining: lead || role === "VENDOR_AM",
    canManageCoaching: lead || role === "VENDOR_AM",
    canManagePerformance: lead || pm,
  };
}

async function assertDeveloperScope(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  developerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (session.user.role === "DEVELOPER") {
    if (session.user.developerId !== developerId) {
      return { ok: false, error: "You can only manage your own development data" };
    }
    return { ok: true };
  }

  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
  });
  if (!developer) return { ok: false, error: "Developer not found" };

  if (
    session.user.role !== "SYS_ADMIN" &&
    session.user.clientId &&
    developer.clientId !== session.user.clientId
  ) {
    return { ok: false, error: "Unauthorized developer scope" };
  }

  return { ok: true };
}

function developerWhere(session: NonNullable<Awaited<ReturnType<typeof auth>>>) {
  if (session.user.role === "DEVELOPER") {
    return { id: session.user.developerId ?? undefined };
  }
  if (session.user.role !== "SYS_ADMIN" && session.user.clientId) {
    return { clientId: session.user.clientId };
  }
  return {};
}

export interface DevelopmentBoardData {
  permissions: DevelopmentPermissions;
  skillCategories: {
    id: string;
    name: string;
    isActive: boolean;
  }[];
  skillsCatalog: {
    id: string;
    name: string;
    categoryId: string;
    categoryName: string;
    description: string | null;
    isActive: boolean;
  }[];
  developerSkills: {
    id: string;
    developerId: string;
    developerName: string;
    skillId: string;
    skillName: string;
    category: string;
    level: string;
    yearsExp: number | null;
    notes: string | null;
    canEdit: boolean;
  }[];
  trainings: {
    id: string;
    developerId: string;
    developerName: string;
    title: string;
    provider: string;
    status: string;
    startDate: string;
    endDate: string | null;
    hours: number;
    skillFocus: string | null;
    location: string | null;
    notes: string | null;
    canEdit: boolean;
  }[];
  coachings: {
    id: string;
    developerId: string;
    developerName: string;
    coachName: string;
    topic: string;
    status: string;
    sessionDate: string;
    durationMin: number;
    outcome: string | null;
    notes: string | null;
    canEdit: boolean;
  }[];
  performanceActions: {
    id: string;
    developerId: string;
    developerName: string;
    actionType: "REWARD" | "PUNISHMENT";
    title: string;
    reason: string;
    points: number;
    actionDate: string;
    notes: string | null;
    canEdit: boolean;
  }[];
  developers: { id: string; name: string }[];
}

export async function getDevelopmentBoard(): Promise<
  ActionResult<DevelopmentBoardData>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "DEVELOPER",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "CLIENT_PM",
      "SYS_ADMIN",
    ]);

    const p = perms(session.user.role);
    const whereDev = developerWhere(session);

    const [
      skillCategories,
      skillsCatalog,
      developerSkills,
      trainings,
      coachings,
      actions,
      developers,
    ] = await Promise.all([
      prisma.skillCategory.findMany({
        where: p.canManageCatalog ? undefined : { isActive: true },
        orderBy: { name: "asc" },
      }),
      prisma.skill.findMany({
        where: p.canManageCatalog ? undefined : { isActive: true },
        include: { category: true },
        orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.developerSkill.findMany({
        where: { developer: whereDev },
        include: {
          skill: { include: { category: true } },
          developer: { include: { user: { select: { name: true } } } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.training.findMany({
        where: { developer: whereDev },
        include: {
          developer: { include: { user: { select: { name: true } } } },
        },
        orderBy: { startDate: "desc" },
        take: 50,
      }),
      prisma.coaching.findMany({
        where: { developer: whereDev },
        include: {
          developer: { include: { user: { select: { name: true } } } },
        },
        orderBy: { sessionDate: "desc" },
        take: 50,
      }),
      prisma.performanceAction.findMany({
        where: { developer: whereDev },
        include: {
          developer: { include: { user: { select: { name: true } } } },
        },
        orderBy: { actionDate: "desc" },
        take: 50,
      }),
      prisma.developer.findMany({
        where: { isActive: true, ...whereDev },
        include: { user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
    ]);

    const canEditTeam =
      session.user.role !== "DEVELOPER" &&
      (p.canAssignSkills ||
        p.canManageTraining ||
        p.canManageCoaching ||
        p.canManagePerformance);

    return ok({
      permissions: p,
      skillCategories: skillCategories.map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
      })),
      skillsCatalog: skillsCatalog.map((s) => ({
        id: s.id,
        name: s.name,
        categoryId: s.categoryId,
        categoryName: s.category.name,
        description: s.description,
        isActive: s.isActive,
      })),
      developerSkills: developerSkills.map((ds) => ({
        id: ds.id,
        developerId: ds.developerId,
        developerName: ds.developer.user.name,
        skillId: ds.skillId,
        skillName: ds.skill.name,
        category: ds.skill.category.name,
        level: ds.level,
        yearsExp: ds.yearsExp !== null ? toNumber(ds.yearsExp) : null,
        notes: ds.notes,
        canEdit:
          p.canAssignSkills &&
          (canEditTeam || ds.developerId === session.user.developerId),
      })),
      trainings: trainings.map((t) => ({
        id: t.id,
        developerId: t.developerId,
        developerName: t.developer.user.name,
        title: t.title,
        provider: t.provider,
        status: t.status,
        startDate: t.startDate.toISOString().slice(0, 10),
        endDate: t.endDate?.toISOString().slice(0, 10) ?? null,
        hours: toNumber(t.hours),
        skillFocus: t.skillFocus,
        location: t.location,
        notes: t.notes,
        canEdit: p.canManageTraining,
      })),
      coachings: coachings.map((c) => ({
        id: c.id,
        developerId: c.developerId,
        developerName: c.developer.user.name,
        coachName: c.coachName,
        topic: c.topic,
        status: c.status,
        sessionDate: c.sessionDate.toISOString().slice(0, 10),
        durationMin: c.durationMin,
        outcome: c.outcome,
        notes: c.notes,
        canEdit: p.canManageCoaching,
      })),
      performanceActions: actions.map((a) => ({
        id: a.id,
        developerId: a.developerId,
        developerName: a.developer.user.name,
        actionType: a.actionType,
        title: a.title,
        reason: a.reason,
        points: a.points,
        actionDate: a.actionDate.toISOString().slice(0, 10),
        notes: a.notes,
        canEdit: p.canManagePerformance,
      })),
      developers: developers.map((d) => ({
        id: d.id,
        name: d.user.name,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load development board";
    return fail(message);
  }
}

export async function upsertSkillCategory(
  input: UpsertSkillCategoryInput
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);
    if (!perms(session.user.role).canManageCatalog) {
      return fail("Unauthorized");
    }

    const parsed = upsertSkillCategorySchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid category");
    }

    const row = parsed.data.id
      ? await prisma.skillCategory.update({
          where: { id: parsed.data.id },
          data: {
            name: parsed.data.name,
            isActive: parsed.data.isActive ?? true,
          },
        })
      : await prisma.skillCategory.create({
          data: {
            name: parsed.data.name,
            isActive: parsed.data.isActive ?? true,
          },
        });

    return ok({ id: row.id, name: row.name });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save category";
    return fail(message);
  }
}

export async function upsertSkillCatalog(
  input: UpsertSkillCatalogInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);
    if (!perms(session.user.role).canManageCatalog) {
      return fail("Unauthorized");
    }

    const parsed = upsertSkillCatalogSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid skill");
    }

    const category = await prisma.skillCategory.findUnique({
      where: { id: parsed.data.categoryId },
    });
    if (!category || !category.isActive) {
      return fail("Skill category not found or inactive");
    }

    const row = parsed.data.id
      ? await prisma.skill.update({
          where: { id: parsed.data.id },
          data: {
            name: parsed.data.name,
            categoryId: parsed.data.categoryId,
            description: parsed.data.description ?? null,
            isActive: parsed.data.isActive ?? true,
          },
        })
      : await prisma.skill.create({
          data: {
            name: parsed.data.name,
            categoryId: parsed.data.categoryId,
            description: parsed.data.description ?? null,
            isActive: parsed.data.isActive ?? true,
          },
        });

    return ok({ id: row.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save skill catalog";
    return fail(message);
  }
}

export async function deleteSkillCatalog(
  input: DeleteSkillCatalogInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD"]);
    if (!perms(session.user.role).canManageCatalog) {
      return fail("Unauthorized");
    }

    const parsed = deleteSkillCatalogSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid delete request");

    const existing = await prisma.skill.findUnique({
      where: { id: parsed.data.id },
      include: { _count: { select: { developers: true } } },
    });
    if (!existing) return fail("Skill not found");

    if (existing._count.developers > 0) {
      await prisma.skill.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return ok({ id: existing.id });
    }

    await prisma.skill.delete({ where: { id: existing.id } });
    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete skill";
    return fail(message);
  }
}

export async function assignDeveloperSkill(
  input: AssignDeveloperSkillInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const p = perms(session.user.role);
    const parsed = assignDeveloperSkillSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid skill assignment");
    }

    if (session.user.role === "DEVELOPER") {
      if (parsed.data.developerId !== session.user.developerId) {
        return fail("Unauthorized");
      }
    } else if (!p.canAssignSkills) {
      return fail("Unauthorized");
    }

    const scope = await assertDeveloperScope(session, parsed.data.developerId);
    if (!scope.ok) return fail(scope.error);

    const row = parsed.data.id
      ? await prisma.developerSkill.update({
          where: { id: parsed.data.id },
          data: {
            level: parsed.data.level,
            yearsExp: parsed.data.yearsExp,
            notes: parsed.data.notes,
            skillId: parsed.data.skillId,
          },
        })
      : await prisma.developerSkill.create({
          data: {
            developerId: parsed.data.developerId,
            skillId: parsed.data.skillId,
            level: parsed.data.level,
            yearsExp: parsed.data.yearsExp,
            notes: parsed.data.notes,
          },
        });

    return ok({ id: row.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to assign skill";
    return fail(message);
  }
}

export async function deleteDeveloperSkill(
  input: DeleteDeveloperSkillInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);

    const parsed = deleteDeveloperSkillSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid delete request");

    const existing = await prisma.developerSkill.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Skill assignment not found");

    const scope = await assertDeveloperScope(session, existing.developerId);
    if (!scope.ok) return fail(scope.error);

    await prisma.developerSkill.delete({ where: { id: existing.id } });
    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete skill";
    return fail(message);
  }
}

export async function upsertTraining(
  input: UpsertTrainingInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);
    if (!perms(session.user.role).canManageTraining) {
      return fail("Unauthorized");
    }

    const parsed = upsertTrainingSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid training");
    }

    const scope = await assertDeveloperScope(session, parsed.data.developerId);
    if (!scope.ok) return fail(scope.error);

    const data = {
      developerId: parsed.data.developerId,
      title: parsed.data.title,
      provider: parsed.data.provider,
      status: parsed.data.status,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate ?? null,
      hours: parsed.data.hours,
      skillFocus: parsed.data.skillFocus || null,
      location: parsed.data.location || null,
      notes: parsed.data.notes || null,
      createdById: session.user.id,
    };

    const row = parsed.data.id
      ? await prisma.training.update({ where: { id: parsed.data.id }, data })
      : await prisma.training.create({ data });

    return ok({ id: row.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save training";
    return fail(message);
  }
}

export async function deleteTraining(
  input: { id: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);
    const parsed = deleteTrainingSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid delete request");

    const existing = await prisma.training.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Training not found");

    const scope = await assertDeveloperScope(session, existing.developerId);
    if (!scope.ok) return fail(scope.error);

    await prisma.training.delete({ where: { id: existing.id } });
    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete training";
    return fail(message);
  }
}

export async function upsertCoaching(
  input: UpsertCoachingInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);
    if (!perms(session.user.role).canManageCoaching) {
      return fail("Unauthorized");
    }

    const parsed = upsertCoachingSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid coaching");
    }

    const scope = await assertDeveloperScope(session, parsed.data.developerId);
    if (!scope.ok) return fail(scope.error);

    const data = {
      developerId: parsed.data.developerId,
      coachName: parsed.data.coachName,
      topic: parsed.data.topic,
      status: parsed.data.status,
      sessionDate: parsed.data.sessionDate,
      durationMin: parsed.data.durationMin,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes,
      createdById: session.user.id,
    };

    const row = parsed.data.id
      ? await prisma.coaching.update({ where: { id: parsed.data.id }, data })
      : await prisma.coaching.create({ data });

    return ok({ id: row.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save coaching";
    return fail(message);
  }
}

export async function deleteCoaching(
  input: { id: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "VENDOR_AM"]);
    const parsed = deleteCoachingSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid delete request");

    const existing = await prisma.coaching.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Coaching not found");

    const scope = await assertDeveloperScope(session, existing.developerId);
    if (!scope.ok) return fail(scope.error);

    await prisma.coaching.delete({ where: { id: existing.id } });
    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete coaching";
    return fail(message);
  }
}

export async function upsertPerformanceAction(
  input: UpsertPerformanceActionInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "CLIENT_PM"]);
    if (!perms(session.user.role).canManagePerformance) {
      return fail("Unauthorized");
    }

    const parsed = upsertPerformanceActionSchema.safeParse(input);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid performance action"
      );
    }

    if (
      parsed.data.actionType === "REWARD" &&
      parsed.data.points < 0
    ) {
      return fail("Reward points should be zero or positive");
    }
    if (
      parsed.data.actionType === "PUNISHMENT" &&
      parsed.data.points > 0
    ) {
      return fail("Punishment points should be zero or negative");
    }

    const scope = await assertDeveloperScope(session, parsed.data.developerId);
    if (!scope.ok) return fail(scope.error);

    const data = {
      developerId: parsed.data.developerId,
      actionType: parsed.data.actionType,
      title: parsed.data.title,
      reason: parsed.data.reason,
      points: parsed.data.points,
      actionDate: parsed.data.actionDate,
      notes: parsed.data.notes,
      issuedById: session.user.id,
    };

    const row = parsed.data.id
      ? await prisma.performanceAction.update({
          where: { id: parsed.data.id },
          data,
        })
      : await prisma.performanceAction.create({ data });

    return ok({ id: row.id });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save performance action";
    return fail(message);
  }
}

export async function deletePerformanceAction(
  input: { id: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    assertRole(session, ["SYS_ADMIN", "VENDOR_LEAD", "CLIENT_PM"]);
    const parsed = deletePerformanceActionSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid delete request");

    const existing = await prisma.performanceAction.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Performance action not found");

    const scope = await assertDeveloperScope(session, existing.developerId);
    if (!scope.ok) return fail(scope.error);

    await prisma.performanceAction.delete({ where: { id: existing.id } });
    return ok({ id: existing.id });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete performance action";
    return fail(message);
  }
}
