import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaVersion?: string;
};

/** Bump whenever schema adds models so hot-reload drops the stale singleton. */
const PRISMA_CLIENT_VERSION = "development-v13-tickets-lazy";

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  const versionOk = globalForPrisma.prismaVersion === PRISMA_CLIENT_VERSION;
  const client = existing as
    | (PrismaClient & Record<string, unknown>)
    | undefined;
  const hasModels =
    client &&
    typeof client.notification !== "undefined" &&
    typeof client.coverageAssignment !== "undefined" &&
    typeof client.skill !== "undefined" &&
    typeof client.skillCategory !== "undefined" &&
    typeof client.training !== "undefined" &&
    typeof client.coaching !== "undefined" &&
    typeof client.performanceAction !== "undefined" &&
    typeof client.operationalTicket !== "undefined" &&
    typeof client.clientMembership !== "undefined";

  if (existing && versionOk && hasModels) {
    return existing;
  }

  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }

  const next = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = next;
    globalForPrisma.prismaVersion = PRISMA_CLIENT_VERSION;
  }
  return next;
}

/**
 * Lazy proxy so server actions never keep a module-level stale PrismaClient
 * after `prisma generate` / schema changes during `next dev`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});
