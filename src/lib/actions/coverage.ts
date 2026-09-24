"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import {
  cancelCoverageSchema,
  createCoverageSchema,
  updateCoverageSchema,
  type CancelCoverageInput,
  type CreateCoverageInput,
  type UpdateCoverageInput,
} from "@/lib/validations/coverage";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface CoverageItem {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  leaveRequestId: string | null;
  leaveLabel: string | null;
  absentDeveloperId: string;
  absentDeveloperName: string;
  coverDeveloperId: string;
  coverDeveloperName: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startDate: string;
  endDate: string;
  reason: string;
  notes: string | null;
  canEdit: boolean;
  canCancel: boolean;
}

export interface CoverageOption {
  id: string;
  name: string;
  label?: string;
}

export interface CoveragePermissions {
  canCreate: boolean;
  canEdit: boolean;
  canCancel: boolean;
}

function coveragePerms(role: Role): CoveragePermissions {
  const manage =
    role === "SYS_ADMIN" ||
    role === "CLIENT_PM" ||
    role === "VENDOR_LEAD" ||
    role === "VENDOR_AM";
  return {
    canCreate: manage,
    canEdit: manage,
    canCancel: manage,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapCoverage(
  row: {
    id: string;
    clientId: string;
    projectId: string;
    leaveRequestId: string | null;
    absentDeveloperId: string;
    coverDeveloperId: string;
    status: CoverageItem["status"];
    startDate: Date;
    endDate: Date;
    reason: string;
    notes: string | null;
    client: { name: string };
    project: { name: string; code: string };
    absentDeveloper: { user: { name: string } };
    coverDeveloper: { user: { name: string } };
    leaveRequest: {
      leaveType: string;
      startDate: Date;
      endDate: Date;
      status: string;
    } | null;
  },
  perms: CoveragePermissions
): CoverageItem {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.client.name,
    projectId: row.projectId,
    projectName: row.project.name,
    projectCode: row.project.code,
    leaveRequestId: row.leaveRequestId,
    leaveLabel: row.leaveRequest
      ? `${row.leaveRequest.leaveType} · ${isoDate(row.leaveRequest.startDate)}→${isoDate(row.leaveRequest.endDate)} (${row.leaveRequest.status})`
      : null,
    absentDeveloperId: row.absentDeveloperId,
    absentDeveloperName: row.absentDeveloper.user.name,
    coverDeveloperId: row.coverDeveloperId,
    coverDeveloperName: row.coverDeveloper.user.name,
    status: row.status,
    startDate: isoDate(row.startDate),
    endDate: isoDate(row.endDate),
    reason: row.reason,
    notes: row.notes,
    canEdit: perms.canEdit && row.status !== "CANCELLED",
    canCancel:
      perms.canCancel &&
      (row.status === "PLANNED" || row.status === "ACTIVE"),
  };
}

const coverageInclude = {
  client: { select: { name: true } },
  project: { select: { name: true, code: true } },
  absentDeveloper: { include: { user: { select: { name: true } } } },
  coverDeveloper: { include: { user: { select: { name: true } } } },
  leaveRequest: {
    select: {
      leaveType: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  },
} as const;

async function resolveCoverageContext(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  projectId: string,
  absentDeveloperId: string,
  coverDeveloperId: string,
  leaveRequestId?: string | null
): Promise<
  | { ok: true; clientId: string }
  | { ok: false; error: string }
> {
  const [project, absent, cover] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.developer.findUnique({ where: { id: absentDeveloperId } }),
    prisma.developer.findUnique({ where: { id: coverDeveloperId } }),
  ]);

  if (!project || !project.isActive) return { ok: false, error: "Project not found or inactive" };
  if (!absent || !absent.isActive) return { ok: false, error: "Absent developer not found or inactive" };
  if (!cover || !cover.isActive) return { ok: false, error: "Cover developer not found or inactive" };

  if (
    project.clientId !== absent.clientId ||
    project.clientId !== cover.clientId
  ) {
    return { ok: false, error: "Developers and project must belong to the same client" };
  }

  if (
    session.user.role !== "SYS_ADMIN" &&
    session.user.clientId &&
    project.clientId !== session.user.clientId
  ) {
    return { ok: false, error: "Unauthorized: project belongs to another client" };
  }

  if (leaveRequestId) {
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
    });
    if (!leave) return { ok: false, error: "Leave request not found" };
    if (leave.developerId !== absentDeveloperId) {
      return {
        ok: false,
        error: "Leave request must belong to the absent developer",
      };
    }
    if (leave.status !== "APPROVED" && leave.status !== "PENDING") {
      return {
        ok: false,
        error: "Leave request must be PENDING or APPROVED",
      };
    }
  }

  return { ok: true, clientId: project.clientId };
}

export async function listCoverages(): Promise<
  ActionResult<{
    items: CoverageItem[];
    permissions: CoveragePermissions;
    projects: CoverageOption[];
    developers: CoverageOption[];
    leaveOptions: CoverageOption[];
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

    const perms = coveragePerms(session.user.role);
    const clientFilter =
      session.user.role === "SYS_ADMIN"
        ? {}
        : session.user.clientId
          ? { clientId: session.user.clientId }
          : { clientId: "__none__" };

    const developerFilter =
      session.user.role === "DEVELOPER"
        ? {
            OR: [
              { absentDeveloperId: session.user.developerId ?? "__none__" },
              { coverDeveloperId: session.user.developerId ?? "__none__" },
            ],
          }
        : clientFilter;

    const [rows, projects, developers, leaves] = await Promise.all([
      prisma.coverageAssignment.findMany({
        where: developerFilter,
        include: coverageInclude,
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        take: 100,
      }),
      perms.canCreate
        ? prisma.project.findMany({
            where: { isActive: true, ...clientFilter },
            orderBy: { name: "asc" },
            select: { id: true, name: true, code: true },
          })
        : Promise.resolve([]),
      perms.canCreate
        ? prisma.developer.findMany({
            where: { isActive: true, ...clientFilter },
            include: { user: { select: { name: true } } },
            orderBy: { user: { name: "asc" } },
          })
        : Promise.resolve([]),
      perms.canCreate
        ? prisma.leaveRequest.findMany({
            where: {
              status: { in: ["PENDING", "APPROVED"] },
              developer: clientFilter,
            },
            include: {
              developer: { include: { user: { select: { name: true } } } },
            },
            orderBy: { startDate: "desc" },
            take: 50,
          })
        : Promise.resolve([]),
    ]);

    return ok({
      items: rows.map((r) => mapCoverage(r, perms)),
      permissions: perms,
      projects: projects.map((p) => ({
        id: p.id,
        name: `${p.name} (${p.code})`,
      })),
      developers: developers.map((d) => ({
        id: d.id,
        name: d.user.name,
      })),
      leaveOptions: leaves.map((l) => ({
        id: l.id,
        name: l.developerId,
        label: `${l.developer.user.name} · ${l.leaveType} · ${isoDate(l.startDate)}→${isoDate(l.endDate)}`,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list coverages";
    return fail(message);
  }
}

export async function createCoverage(
  input: CreateCoverageInput
): Promise<ActionResult<CoverageItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);
    const perms = coveragePerms(session.user.role);
    if (!perms.canCreate) return fail("Unauthorized to create coverage");

    const parsed = createCoverageSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid coverage data");
    }

    const ctx = await resolveCoverageContext(
      session,
      parsed.data.projectId,
      parsed.data.absentDeveloperId,
      parsed.data.coverDeveloperId,
      parsed.data.leaveRequestId
    );
    if (!ctx.ok) return fail(ctx.error);

    const created = await prisma.coverageAssignment.create({
      data: {
        clientId: ctx.clientId,
        projectId: parsed.data.projectId,
        leaveRequestId: parsed.data.leaveRequestId || null,
        absentDeveloperId: parsed.data.absentDeveloperId,
        coverDeveloperId: parsed.data.coverDeveloperId,
        status: parsed.data.status,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        reason: parsed.data.reason,
        notes: parsed.data.notes || null,
        createdById: session.user.id,
      },
      include: coverageInclude,
    });

    return ok(mapCoverage(created, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create coverage";
    return fail(message);
  }
}

export async function updateCoverage(
  input: UpdateCoverageInput
): Promise<ActionResult<CoverageItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);
    const perms = coveragePerms(session.user.role);
    if (!perms.canEdit) return fail("Unauthorized to edit coverage");

    const parsed = updateCoverageSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid coverage data");
    }

    const existing = await prisma.coverageAssignment.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Coverage not found");
    if (existing.status === "CANCELLED") {
      return fail("Cancelled coverage cannot be edited");
    }

    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      existing.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized: coverage belongs to another client");
    }

    const ctx = await resolveCoverageContext(
      session,
      parsed.data.projectId,
      parsed.data.absentDeveloperId,
      parsed.data.coverDeveloperId,
      parsed.data.leaveRequestId
    );
    if (!ctx.ok) return fail(ctx.error);

    const updated = await prisma.coverageAssignment.update({
      where: { id: existing.id },
      data: {
        clientId: ctx.clientId,
        projectId: parsed.data.projectId,
        leaveRequestId: parsed.data.leaveRequestId || null,
        absentDeveloperId: parsed.data.absentDeveloperId,
        coverDeveloperId: parsed.data.coverDeveloperId,
        status: parsed.data.status,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        reason: parsed.data.reason,
        notes: parsed.data.notes || null,
      },
      include: coverageInclude,
    });

    return ok(mapCoverage(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update coverage";
    return fail(message);
  }
}

export async function cancelCoverage(
  input: CancelCoverageInput
): Promise<ActionResult<CoverageItem>> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);
    const perms = coveragePerms(session.user.role);
    if (!perms.canCancel) return fail("Unauthorized to cancel coverage");

    const parsed = cancelCoverageSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid cancel request");

    const existing = await prisma.coverageAssignment.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) return fail("Coverage not found");
    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      existing.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized: coverage belongs to another client");
    }
    if (existing.status === "CANCELLED") {
      return fail("Coverage already cancelled");
    }

    const updated = await prisma.coverageAssignment.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
      include: coverageInclude,
    });

    return ok(mapCoverage(updated, perms));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel coverage";
    return fail(message);
  }
}
