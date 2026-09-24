"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import {
  MAX_DAILY_HOURS,
  MAX_WEEKLY_HOURS_HARD_CAP,
} from "@/lib/constants";
import {
  createOvertimeRequestSchema,
  reviewOvertimeRequestSchema,
  type CreateOvertimeRequestInput,
  type ReviewOvertimeRequestInput,
} from "@/lib/validations/overtime";
import { getWeekBounds, toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface OvertimeRequestItem {
  id: string;
  developerId: string;
  developerName: string;
  workDate: string;
  requestedHours: number;
  reason: string;
  status: "PENDING" | "APPROVED_CLIENT" | "REJECTED_CLIENT";
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export async function createOvertimeRequest(
  input: CreateOvertimeRequestInput
): Promise<ActionResult<OvertimeRequestItem>> {
  try {
    const session = await auth();
    assertRole(session, ["DEVELOPER", "VENDOR_LEAD", "SYS_ADMIN"]);

    const parsed = createOvertimeRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(
        parsed.error.issues[0]?.message ?? "Invalid overtime request"
      );
    }

    const developerId = session.user.developerId;
    if (!developerId) {
      return fail("Developer profile not found for current user");
    }

    const data = parsed.data;
    const workDate = new Date(data.workDate);
    workDate.setHours(0, 0, 0, 0);

    const dayEnd = new Date(workDate);
    dayEnd.setHours(23, 59, 59, 999);

    const existingDay = await prisma.timesheet.aggregate({
      where: {
        developerId,
        workDate: { gte: workDate, lte: dayEnd },
      },
      _sum: { hours: true },
    });

    const dayTotal =
      toNumber(existingDay._sum.hours ?? 0) + data.requestedHours;
    if (dayTotal > MAX_DAILY_HOURS) {
      return fail(
        `Request would exceed daily hard cap of ${MAX_DAILY_HOURS}h (projected ${dayTotal.toFixed(1)}h).`
      );
    }

    const { weekStart, weekEnd } = getWeekBounds(workDate);
    const existingWeek = await prisma.timesheet.aggregate({
      where: {
        developerId,
        workDate: { gte: weekStart, lte: weekEnd },
      },
      _sum: { hours: true },
    });

    const pendingOt = await prisma.overtimeRequest.aggregate({
      where: {
        developerId,
        status: "PENDING",
        workDate: { gte: weekStart, lte: weekEnd },
      },
      _sum: { requestedHours: true },
    });

    const weekProjected =
      toNumber(existingWeek._sum.hours ?? 0) +
      toNumber(pendingOt._sum.requestedHours ?? 0) +
      data.requestedHours;

    if (weekProjected > MAX_WEEKLY_HOURS_HARD_CAP) {
      return fail(
        `Request would exceed weekly hard cap of ${MAX_WEEKLY_HOURS_HARD_CAP}h including pending OT (projected ${weekProjected.toFixed(1)}h).`
      );
    }

    const duplicate = await prisma.overtimeRequest.findFirst({
      where: {
        developerId,
        workDate,
        status: "PENDING",
      },
    });

    if (duplicate) {
      return fail("A pending overtime request already exists for this date");
    }

    const developer = await prisma.developer.findUnique({
      where: { id: developerId },
      include: { user: { select: { name: true } } },
    });

    if (!developer) {
      return fail("Developer not found");
    }

    if (!developer.overtimeEligible) {
      return fail(
        "You are not eligible for overtime (salary is lump-sum / OT already included). Contact Vendor Lead if this is incorrect."
      );
    }

    const request = await prisma.overtimeRequest.create({
      data: {
        developerId,
        workDate,
        requestedHours: data.requestedHours,
        reason: data.reason,
        status: "PENDING",
      },
    });

    return ok({
      id: request.id,
      developerId: developer.id,
      developerName: developer.user.name,
      workDate: request.workDate.toISOString().slice(0, 10),
      requestedHours: toNumber(request.requestedHours),
      reason: request.reason,
      status: request.status,
      reviewNote: request.reviewNote,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create overtime request";
    return fail(message);
  }
}

export async function reviewOvertimeRequest(
  input: ReviewOvertimeRequestInput
): Promise<ActionResult<OvertimeRequestItem>> {
  try {
    const session = await auth();
    assertRole(session, ["CLIENT_PM", "SYS_ADMIN"]);

    const parsed = reviewOvertimeRequestSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid review payload");
    }

    const existing = await prisma.overtimeRequest.findUnique({
      where: { id: parsed.data.requestId },
      include: {
        developer: {
          include: {
            user: { select: { name: true } },
            client: true,
          },
        },
      },
    });

    if (!existing) {
      return fail("Overtime request not found");
    }

    if (existing.status !== "PENDING") {
      return fail("Only pending requests can be reviewed");
    }

    if (
      session.user.role === "CLIENT_PM" &&
      session.user.clientId &&
      existing.developer.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized: request belongs to another client");
    }

    if (
      parsed.data.decision === "REJECTED_CLIENT" &&
      !parsed.data.reviewNote?.trim()
    ) {
      return fail("Review note is required when rejecting");
    }

    const updated = await prisma.overtimeRequest.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.decision,
        reviewNote: parsed.data.reviewNote?.trim() || null,
        reviewedAt: new Date(),
      },
      include: {
        developer: { include: { user: { select: { name: true } } } },
      },
    });

    return ok({
      id: updated.id,
      developerId: updated.developerId,
      developerName: updated.developer.user.name,
      workDate: updated.workDate.toISOString().slice(0, 10),
      requestedHours: toNumber(updated.requestedHours),
      reason: updated.reason,
      status: updated.status,
      reviewNote: updated.reviewNote,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to review overtime request";
    return fail(message);
  }
}

export async function listOvertimeRequests(): Promise<
  ActionResult<OvertimeRequestItem[]>
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

    const where =
      session.user.role === "DEVELOPER"
        ? { developerId: session.user.developerId ?? undefined }
        : session.user.role === "SYS_ADMIN"
          ? undefined
          : {
              developer: {
                clientId: session.user.clientId ?? undefined,
              },
            };

    const requests = await prisma.overtimeRequest.findMany({
      where,
      include: {
        developer: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    return ok(
      requests.map((r) => ({
        id: r.id,
        developerId: r.developerId,
        developerName: r.developer.user.name,
        workDate: r.workDate.toISOString().slice(0, 10),
        requestedHours: toNumber(r.requestedHours),
        reason: r.reason,
        status: r.status,
        reviewNote: r.reviewNote,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to list overtime requests";
    return fail(message);
  }
}

export async function getMyOvertimeEligibility(): Promise<
  ActionResult<{ eligible: boolean; reason: string | null }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "DEVELOPER",
      "VENDOR_LEAD",
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_AM",
    ]);

    if (!session.user.developerId) {
      return ok({
        eligible: false,
        reason: "No developer profile linked to this account",
      });
    }

    const developer = await prisma.developer.findUnique({
      where: { id: session.user.developerId },
      select: { overtimeEligible: true },
    });

    if (!developer) {
      return ok({ eligible: false, reason: "Developer profile not found" });
    }

    if (!developer.overtimeEligible) {
      return ok({
        eligible: false,
        reason:
          "Not eligible for overtime — salary is lump-sum / OT already included. Ask Vendor Lead to change this in Personnel if incorrect.",
      });
    }

    return ok({ eligible: true, reason: null });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load overtime eligibility";
    return fail(message);
  }
}
