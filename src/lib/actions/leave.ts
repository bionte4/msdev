"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import {
  cancelLeaveRequestSchema,
  countLeaveDays,
  createLeaveRequestSchema,
  reviewLeaveRequestSchema,
  updateLeaveRequestSchema,
  type CancelLeaveRequestInput,
  type CreateLeaveRequestInput,
  type ReviewLeaveRequestInput,
  type UpdateLeaveRequestInput,
} from "@/lib/validations/leave";
import { toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";
import { notifyUsers } from "@/lib/actions/notifications";

export interface LeaveRequestItem {
  id: string;
  developerId: string;
  developerName: string;
  leaveType: "ANNUAL_LEAVE" | "SICK" | "UNPAID" | "OTHER";
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  canEdit: boolean;
  canCancel: boolean;
  canReview: boolean;
}

export interface LeavePermissions {
  canCreate: boolean;
  canReview: boolean;
  canSelectDeveloper: boolean;
}

function leavePerms(role: Role): LeavePermissions {
  return {
    canCreate:
      role === "DEVELOPER" ||
      role === "VENDOR_LEAD" ||
      role === "SYS_ADMIN",
    canReview:
      role === "CLIENT_PM" ||
      role === "VENDOR_LEAD" ||
      role === "SYS_ADMIN",
    canSelectDeveloper:
      role === "VENDOR_LEAD" || role === "SYS_ADMIN",
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function leaveTypeLabel(type: string): string {
  switch (type) {
    case "ANNUAL_LEAVE":
      return "Annual leave";
    case "SICK":
      return "Sick leave";
    case "UNPAID":
      return "Unpaid leave";
    default:
      return "Leave";
  }
}

async function notifyLeaveReviewers(params: {
  clientId: string;
  excludeUserId?: string | null;
  title: string;
  body: string;
  type?: "INFO" | "SUCCESS" | "WARNING" | "ALERT";
}) {
  const reviewers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["CLIENT_PM", "VENDOR_LEAD", "SYS_ADMIN"] },
      OR: [{ role: "SYS_ADMIN" }, { clientId: params.clientId }],
      ...(params.excludeUserId ? { NOT: { id: params.excludeUserId } } : {}),
    },
    select: { id: true },
  });

  await notifyUsers(
    reviewers.map((u) => u.id),
    {
      title: params.title,
      body: params.body,
      href: "/personnel",
      type: params.type ?? "WARNING",
    }
  );
}

function mapLeave(
  row: {
    id: string;
    developerId: string;
    leaveType: LeaveRequestItem["leaveType"];
    status: LeaveRequestItem["status"];
    startDate: Date;
    endDate: Date;
    totalDays: unknown;
    reason: string;
    reviewNote: string | null;
    reviewedAt: Date | null;
    developer: { user: { name: string }; clientId: string };
  },
  sessionRole: Role,
  sessionDeveloperId: string | null | undefined,
  sessionClientId: string | null | undefined
): LeaveRequestItem {
  const isOwn = row.developerId === sessionDeveloperId;
  const sameClient =
    sessionRole === "SYS_ADMIN" ||
    !sessionClientId ||
    row.developer.clientId === sessionClientId;

  const canReview =
    sameClient &&
    row.status === "PENDING" &&
    (sessionRole === "CLIENT_PM" ||
      sessionRole === "VENDOR_LEAD" ||
      sessionRole === "SYS_ADMIN");

  const canEdit =
    row.status === "PENDING" &&
    sameClient &&
    (isOwn ||
      sessionRole === "SYS_ADMIN" ||
      sessionRole === "VENDOR_LEAD");

  const canCancel = canEdit;

  return {
    id: row.id,
    developerId: row.developerId,
    developerName: row.developer.user.name,
    leaveType: row.leaveType,
    status: row.status,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    totalDays: toNumber(row.totalDays),
    reason: row.reason,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    canEdit,
    canCancel,
    canReview,
  };
}

async function resolveDeveloperId(
  session: NonNullable<Awaited<ReturnType<typeof auth>>>,
  requested?: string
): Promise<{ ok: true; developerId: string } | { ok: false; error: string }> {
  const perms = leavePerms(session.user.role);

  if (requested) {
    if (!perms.canSelectDeveloper && requested !== session.user.developerId) {
      return { ok: false, error: "You can only request leave for yourself" };
    }

    const developer = await prisma.developer.findUnique({
      where: { id: requested },
    });
    if (!developer?.isActive) {
      return { ok: false, error: "Developer not found or inactive" };
    }

    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      developer.clientId !== session.user.clientId
    ) {
      return { ok: false, error: "Unauthorized developer selection" };
    }

    return { ok: true, developerId: requested };
  }

  if (!session.user.developerId) {
    return {
      ok: false,
      error: "Developer profile required, or select a developer",
    };
  }

  return { ok: true, developerId: session.user.developerId };
}

export async function listLeaveRequests(): Promise<
  ActionResult<{ items: LeaveRequestItem[]; permissions: LeavePermissions }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "DEVELOPER",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "SYS_ADMIN",
    ]);

    const perms = leavePerms(session.user.role);

    const rows = await prisma.leaveRequest.findMany({
      where: {
        ...(session.user.role === "DEVELOPER"
          ? { developerId: session.user.developerId ?? undefined }
          : session.user.role !== "SYS_ADMIN" && session.user.clientId
            ? { developer: { clientId: session.user.clientId } }
            : {}),
      },
      include: {
        developer: {
          include: { user: { select: { name: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 100,
    });

    return ok({
      items: rows.map((r) =>
        mapLeave(
          r,
          session.user.role,
          session.user.developerId,
          session.user.clientId
        )
      ),
      permissions: perms,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list leave requests";
    return fail(message);
  }
}

export async function createLeaveRequest(
  input: CreateLeaveRequestInput
): Promise<ActionResult<LeaveRequestItem>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);

    const perms = leavePerms(session.user.role);
    if (!perms.canCreate) return fail("Unauthorized to create leave request");

    const parsed = createLeaveRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid leave request");
    }

    const target = await resolveDeveloperId(session, parsed.data.developerId);
    if (!target.ok) return fail(target.error);

    const startDate = new Date(parsed.data.startDate);
    const endDate = new Date(parsed.data.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        developerId: target.developerId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    if (overlap) {
      return fail("Overlapping leave request already exists for this period");
    }

    const created = await prisma.leaveRequest.create({
      data: {
        developerId: target.developerId,
        leaveType: parsed.data.leaveType,
        startDate,
        endDate,
        totalDays: countLeaveDays(startDate, endDate),
        reason: parsed.data.reason,
        status: "PENDING",
      },
      include: {
        developer: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    await notifyLeaveReviewers({
      clientId: created.developer.clientId,
      excludeUserId: session.user.id,
      title: `New ${leaveTypeLabel(created.leaveType)} request`,
      body: `${created.developer.user.name} requested ${leaveTypeLabel(created.leaveType).toLowerCase()} ${isoDate(startDate)} → ${isoDate(endDate)} (${toNumber(created.totalDays)} day(s)).`,
      type: created.leaveType === "SICK" ? "ALERT" : "WARNING",
    });

    return ok(
      mapLeave(
        created,
        session.user.role,
        session.user.developerId,
        session.user.clientId
      )
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create leave request";
    return fail(message);
  }
}

export async function updateLeaveRequest(
  input: UpdateLeaveRequestInput
): Promise<ActionResult<LeaveRequestItem>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);

    const parsed = updateLeaveRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid leave request");
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id: parsed.data.id },
      include: {
        developer: { include: { user: { select: { name: true } } } },
      },
    });

    if (!existing) return fail("Leave request not found");

    const current = mapLeave(
      existing,
      session.user.role,
      session.user.developerId,
      session.user.clientId
    );
    if (!current.canEdit) {
      return fail("Unauthorized to edit this leave request");
    }

    const startDate = new Date(parsed.data.startDate);
    const endDate = new Date(parsed.data.endDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const updated = await prisma.leaveRequest.update({
      where: { id: existing.id },
      data: {
        leaveType: parsed.data.leaveType,
        startDate,
        endDate,
        totalDays: countLeaveDays(startDate, endDate),
        reason: parsed.data.reason,
      },
      include: {
        developer: { include: { user: { select: { name: true } } } },
      },
    });

    return ok(
      mapLeave(
        updated,
        session.user.role,
        session.user.developerId,
        session.user.clientId
      )
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update leave request";
    return fail(message);
  }
}

export async function reviewLeaveRequest(
  input: ReviewLeaveRequestInput
): Promise<ActionResult<LeaveRequestItem>> {
  try {
    const session = await auth();
    assertRole(session, ["CLIENT_PM", "VENDOR_LEAD", "SYS_ADMIN"]);

    const parsed = reviewLeaveRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid review payload");
    }

    if (
      parsed.data.decision === "REJECTED" &&
      !parsed.data.reviewNote?.trim()
    ) {
      return fail("Review note is required when rejecting");
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id: parsed.data.id },
      include: {
        developer: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!existing) return fail("Leave request not found");

    const current = mapLeave(
      existing,
      session.user.role,
      session.user.developerId,
      session.user.clientId
    );
    if (!current.canReview) {
      return fail("Unauthorized to review this leave request");
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.decision,
        reviewNote: parsed.data.reviewNote?.trim() || null,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
      },
      include: {
        developer: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    const approved = parsed.data.decision === "APPROVED";
    await notifyUsers([updated.developer.user.id], {
      title: approved
        ? `${leaveTypeLabel(updated.leaveType)} approved`
        : `${leaveTypeLabel(updated.leaveType)} rejected`,
      body: approved
        ? `Your ${leaveTypeLabel(updated.leaveType).toLowerCase()} ${isoDate(updated.startDate)} → ${isoDate(updated.endDate)} was approved.`
        : `Your ${leaveTypeLabel(updated.leaveType).toLowerCase()} was rejected${parsed.data.reviewNote ? `: ${parsed.data.reviewNote}` : "."}`,
      href: "/personnel",
      type: approved ? "SUCCESS" : "ALERT",
    });

    return ok(
      mapLeave(
        updated,
        session.user.role,
        session.user.developerId,
        session.user.clientId
      )
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to review leave request";
    return fail(message);
  }
}

export async function cancelLeaveRequest(
  input: CancelLeaveRequestInput
): Promise<ActionResult<LeaveRequestItem>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);

    const parsed = cancelLeaveRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid cancel request");
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id: parsed.data.id },
      include: {
        developer: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!existing) return fail("Leave request not found");

    const current = mapLeave(
      existing,
      session.user.role,
      session.user.developerId,
      session.user.clientId
    );
    if (!current.canCancel) {
      return fail("Unauthorized to cancel this leave request");
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
      include: {
        developer: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    await notifyLeaveReviewers({
      clientId: updated.developer.clientId,
      excludeUserId: session.user.id,
      title: `${leaveTypeLabel(updated.leaveType)} cancelled`,
      body: `${updated.developer.user.name} cancelled ${leaveTypeLabel(updated.leaveType).toLowerCase()} ${isoDate(updated.startDate)} → ${isoDate(updated.endDate)}.`,
      type: "INFO",
    });

    return ok(
      mapLeave(
        updated,
        session.user.role,
        session.user.developerId,
        session.user.clientId
      )
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to cancel leave request";
    return fail(message);
  }
}
