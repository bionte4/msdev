import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaVersion?: string;
};

const PRISMA_CLIENT_VERSION = "development-v5-training-schedule";

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  const versionOk = globalForPrisma.prismaVersion === PRISMA_CLIENT_VERSION;
  const hasModels =
    existing &&
    typeof (existing as { skill?: unknown }).skill !== "undefined" &&
    typeof (existing as { skillCategory?: unknown }).skillCategory !==
      "undefined" &&
    typeof (existing as { training?: unknown }).training !== "undefined" &&
    typeof (existing as { coaching?: unknown }).coaching !== "undefined" &&
    typeof (existing as { performanceAction?: unknown }).performanceAction !==
      "undefined";

  if (existing && versionOk && hasModels) {
    return existing;
  }

  if (existing) {
    void existing.$disconnect().catch(() => undefined);
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaVersion = PRISMA_CLIENT_VERSION;
  }
  return client;
}

export const prisma = getPrismaClient();
