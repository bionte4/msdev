"use server";

import { prisma } from "@/lib/prisma";
import { auth, assertRole } from "@/lib/auth";
import {
  createScopeSwapSchema,
  type CreateScopeSwapInput,
} from "@/lib/validations/scope-swap";
import { toNumber } from "@/lib/utils";
import { fail, ok, type ActionResult } from "@/types/actions";

export interface ScopeSwapResult {
  id: string;
  projectName: string;
  outDeveloperName: string;
  inDeveloperName: string;
  outStoryPoints: number;
  inStoryPoints: number;
  outHours: number;
  inHours: number;
  status: string;
}

export interface ScopeSwapListItem {
  id: string;
  projectName: string;
  outDeveloperName: string;
  inDeveloperName: string;
  outStoryPoints: number;
  inStoryPoints: number;
  outHours: number;
  inHours: number;
  status: string;
  createdAt: string;
}

export async function createScopeSwap(
  input: CreateScopeSwapInput
): Promise<ActionResult<ScopeSwapResult>> {
  try {
    const session = await auth();
    assertRole(session, [
      "CLIENT_PM",
      "VENDOR_LEAD",
      "SYS_ADMIN",
    ]);

    const parsed = createScopeSwapSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid scope swap data");
    }

    const data = parsed.data;

    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    });

    if (!project || !project.isActive) {
      return fail("Project not found or inactive");
    }

    if (
      session.user.role !== "SYS_ADMIN" &&
      session.user.clientId &&
      project.clientId !== session.user.clientId
    ) {
      return fail("Unauthorized: project belongs to another client");
    }

    const [outDev, inDev] = await Promise.all([
      prisma.developer.findUnique({
        where: { id: data.outDeveloperId },
        include: { user: { select: { name: true } } },
      }),
      prisma.developer.findUnique({
        where: { id: data.inDeveloperId },
        include: { user: { select: { name: true } } },
      }),
    ]);

    if (!outDev?.isActive || !inDev?.isActive) {
      return fail("Both developers must be active");
    }

    if (
      outDev.clientId !== project.clientId ||
      inDev.clientId !== project.clientId
    ) {
      return fail("Developers must belong to the same client as the project");
    }

    const swap = await prisma.scopeSwap.create({
      data: {
        clientId: project.clientId,
        projectId: data.projectId,
        requestedById: session.user.id,
        outDeveloperId: data.outDeveloperId,
        inDeveloperId: data.inDeveloperId,
        outStoryPoints: data.outStoryPoints,
        inStoryPoints: data.inStoryPoints,
        outHours: data.outHours,
        inHours: data.inHours,
        outTaskDescription: data.outTaskDescription,
        inTaskDescription: data.inTaskDescription,
        rationale: data.rationale,
        status: "PENDING",
      },
      include: {
        project: true,
        outDeveloper: { include: { user: { select: { name: true } } } },
        inDeveloper: { include: { user: { select: { name: true } } } },
      },
    });

    return ok({
      id: swap.id,
      projectName: swap.project.name,
      outDeveloperName: swap.outDeveloper.user.name,
      inDeveloperName: swap.inDeveloper.user.name,
      outStoryPoints: toNumber(swap.outStoryPoints),
      inStoryPoints: toNumber(swap.inStoryPoints),
      outHours: toNumber(swap.outHours),
      inHours: toNumber(swap.inHours),
      status: swap.status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create scope swap";
    return fail(message);
  }
}

export async function listScopeSwaps(): Promise<
  ActionResult<ScopeSwapListItem[]>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "SYS_ADMIN",
    ]);

    const swaps = await prisma.scopeSwap.findMany({
      where:
        session.user.role === "SYS_ADMIN"
          ? undefined
          : { clientId: session.user.clientId ?? undefined },
      include: {
        project: { select: { name: true } },
        outDeveloper: { include: { user: { select: { name: true } } } },
        inDeveloper: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return ok(
      swaps.map((s) => ({
        id: s.id,
        projectName: s.project.name,
        outDeveloperName: s.outDeveloper.user.name,
        inDeveloperName: s.inDeveloper.user.name,
        outStoryPoints: toNumber(s.outStoryPoints),
        inStoryPoints: toNumber(s.inStoryPoints),
        outHours: toNumber(s.outHours),
        inHours: toNumber(s.inHours),
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list scope swaps";
    return fail(message);
  }
}

export async function getScopeSwapFormOptions(): Promise<
  ActionResult<{
    projects: { id: string; name: string }[];
    developers: { id: string; name: string }[];
  }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "CLIENT_PM",
      "VENDOR_LEAD",
      "SYS_ADMIN",
    ]);

    const clientFilter =
      session.user.role !== "SYS_ADMIN" && session.user.clientId
        ? { clientId: session.user.clientId }
        : {};

    const [projects, developers] = await Promise.all([
      prisma.project.findMany({
        where: { isActive: true, ...clientFilter },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.developer.findMany({
        where: { isActive: true, ...clientFilter },
        include: { user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
    ]);

    return ok({
      projects,
      developers: developers.map((d) => ({
        id: d.id,
        name: d.user.name,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load scope swap options";
    return fail(message);
  }
}
