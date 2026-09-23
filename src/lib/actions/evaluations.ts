"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import {
  EVALUATION_REPLACEMENT_THRESHOLD,
  REPLACEMENT_SLA_WORKING_DAYS,
} from "@/lib/constants";
import {
  calculateWeightedScore,
  createEvaluationSchema,
  type CreateEvaluationInput,
} from "@/lib/validations/evaluation";
import { addWorkingDays, toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface EvaluationResult {
  id: string;
  developerId: string;
  developerName: string;
  year: number;
  month: number;
  totalScore: number;
  replacementTriggered: boolean;
  replacementTicketId?: string;
  slaDueDate?: string;
}

export interface EvaluationListItem {
  id: string;
  developerName: string;
  year: number;
  month: number;
  totalScore: number;
  hasReplacement: boolean;
  createdAt: string;
}

export async function submitMonthlyEvaluation(
  input: CreateEvaluationInput
): Promise<ActionResult<EvaluationResult>> {
  try {
    const session = await auth();
    assertRole(session, ["CLIENT_PM", "SYS_ADMIN"]);

    const parsed = createEvaluationSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid evaluation data");
    }

    const data = parsed.data;
    const totalScore = calculateWeightedScore(data);

    const developer = await prisma.developer.findUnique({
      where: { id: data.developerId },
      include: { user: { select: { name: true } } },
    });

    if (!developer || !developer.isActive) {
      return fail("Developer not found or inactive");
    }

    if (
      session.user.role === "CLIENT_PM" &&
      session.user.clientId &&
      developer.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized: developer belongs to another client");
    }

    const existing = await prisma.monthlyEvaluation.findUnique({
      where: {
        developerId_year_month: {
          developerId: data.developerId,
          year: data.year,
          month: data.month,
        },
      },
    });

    if (existing) {
      return fail(
        `Evaluation for ${data.month}/${data.year} already exists for this developer`
      );
    }

    const replacementTriggered =
      totalScore < EVALUATION_REPLACEMENT_THRESHOLD;
    const slaDueDate = addWorkingDays(
      new Date(),
      REPLACEMENT_SLA_WORKING_DAYS
    );

    const result = await prisma.$transaction(async (tx) => {
      const evaluation = await tx.monthlyEvaluation.create({
        data: {
          developerId: data.developerId,
          clientId: developer.clientId,
          evaluatedById: session.user.id,
          year: data.year,
          month: data.month,
          codeQuality: data.codeQuality,
          delivery: data.delivery,
          technical: data.technical,
          communication: data.communication,
          professionalism: data.professionalism,
          totalScore,
          comments: data.comments,
        },
      });

      let replacementTicketId: string | undefined;

      if (replacementTriggered) {
        const ticket = await tx.replacementTicket.create({
          data: {
            evaluationId: evaluation.id,
            clientId: developer.clientId,
            outgoingDeveloperId: developer.id,
            status: "OPEN",
            slaTargetDays: REPLACEMENT_SLA_WORKING_DAYS,
            slaDueDate,
            triggerScore: totalScore,
            notes: `Auto-triggered: score ${totalScore.toFixed(2)} < ${EVALUATION_REPLACEMENT_THRESHOLD.toFixed(2)}`,
          },
        });
        replacementTicketId = ticket.id;
      }

      return { evaluation, replacementTicketId };
    });

    return ok({
      id: result.evaluation.id,
      developerId: developer.id,
      developerName: developer.user.name,
      year: data.year,
      month: data.month,
      totalScore,
      replacementTriggered,
      replacementTicketId: result.replacementTicketId,
      slaDueDate: replacementTriggered
        ? slaDueDate.toISOString()
        : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to submit monthly evaluation";
    return fail(message);
  }
}

export async function listMonthlyEvaluations(): Promise<
  ActionResult<EvaluationListItem[]>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "CLIENT_PM",
      "SYS_ADMIN",
      "VENDOR_LEAD",
      "VENDOR_AM",
    ]);

    const evaluations = await prisma.monthlyEvaluation.findMany({
      where:
        session.user.role === "SYS_ADMIN"
          ? undefined
          : { clientId: session.user.clientId ?? undefined },
      include: {
        developer: { include: { user: { select: { name: true } } } },
        replacementTicket: { select: { id: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return ok(
      evaluations.map((e) => ({
        id: e.id,
        developerName: e.developer.user.name,
        year: e.year,
        month: e.month,
        totalScore: toNumber(e.totalScore),
        hasReplacement: Boolean(e.replacementTicket),
        createdAt: e.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list evaluations";
    return fail(message);
  }
}

export async function getDevelopersForEvaluation(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    const session = await auth();
    assertRole(session, ["CLIENT_PM", "SYS_ADMIN"]);

    const developers = await prisma.developer.findMany({
      where: {
        isActive: true,
        ...(session.user.role !== "SYS_ADMIN" && session.user.clientId
          ? { clientId: session.user.clientId }
          : {}),
      },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    });

    return ok(
      developers.map((d) => ({
        id: d.id,
        name: d.user.name,
      }))
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load developers";
    return fail(message);
  }
}
