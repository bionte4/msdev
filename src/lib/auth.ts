import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { EngagementMode, Role } from "@/lib/constants";
import { getEffectiveRoles } from "@/lib/effective-roles";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
            include: {
              developer: true,
              client: { select: { engagementMode: true } },
            },
          });

          if (!user?.passwordHash) {
            return null;
          }

          if (!user.isActive) {
            return null;
          }

          const valid = await compare(credentials.password, user.passwordHash);
          if (!valid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as Role,
            clientId: user.clientId,
            developerId: user.developer?.id ?? null,
            engagementMode:
              (user.client?.engagementMode as EngagementMode | undefined) ??
              null,
          };
        } catch (error) {
          console.error("[auth] login failed:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.clientId = user.clientId;
        token.developerId = user.developerId;
        token.engagementMode = user.engagementMode ?? null;
        return token;
      }

      // Refresh engagement mode for Client PM (body-shopping dual-hat).
      if (
        token.role === "CLIENT_PM" &&
        typeof token.clientId === "string" &&
        token.clientId
      ) {
        try {
          const client = await prisma.client.findUnique({
            where: { id: token.clientId },
            select: { engagementMode: true },
          });
          token.engagementMode =
            (client?.engagementMode as EngagementMode | undefined) ??
            "MANAGED";
        } catch {
          // Stale Prisma client / transient DB errors must not break the session.
          token.engagementMode =
            (token.engagementMode as EngagementMode | null | undefined) ??
            "MANAGED";
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.clientId = token.clientId;
        session.user.developerId = token.developerId;
        session.user.engagementMode = token.engagementMode ?? null;
      }
      return session;
    },
  },
};

export async function auth() {
  return getServerSession(authOptions);
}

export function assertRole(
  session: Awaited<ReturnType<typeof auth>>,
  allowed: Role[]
): asserts session is NonNullable<Awaited<ReturnType<typeof auth>>> {
  if (!session) {
    throw new Error("Unauthorized access");
  }
  const effective = getEffectiveRoles(
    session.user.role,
    session.user.engagementMode
  );
  if (!effective.some((role) => allowed.includes(role))) {
    throw new Error("Unauthorized access");
  }
}
