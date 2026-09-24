import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { EngagementMode, Role } from "@/lib/constants";
import { getEffectiveRoles } from "@/lib/effective-roles";
import {
  ensureMembershipBackfill,
  listMembershipsForUser,
  type MembershipClientSummary,
} from "@/lib/client-membership";

async function loadSessionMemberships(
  userId: string,
  role: Role,
  clientId: string | null | undefined
): Promise<{
  memberships: MembershipClientSummary[];
  clientId: string | null;
  engagementMode: EngagementMode | null;
}> {
  if (role === "SYS_ADMIN") {
    return { memberships: [], clientId: null, engagementMode: null };
  }

  await ensureMembershipBackfill(userId);
  const memberships = await listMembershipsForUser(userId);

  let activeId =
    (clientId && memberships.some((m) => m.id === clientId)
      ? clientId
      : null) ??
    memberships.find((m) => m.isPrimary)?.id ??
    memberships[0]?.id ??
    null;

  const active = memberships.find((m) => m.id === activeId) ?? null;

  return {
    memberships,
    clientId: activeId,
    engagementMode: active?.engagementMode ?? null,
  };
}

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

        const email = credentials.email.trim().toLowerCase();

        try {
          const user = await prisma.user.findUnique({
            where: { email },
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

          const role = user.role as Role;
          let loaded: {
            memberships: MembershipClientSummary[];
            clientId: string | null;
            engagementMode: EngagementMode | null;
          };

          try {
            loaded = await loadSessionMemberships(
              user.id,
              role,
              user.clientId
            );
          } catch (membershipError) {
            console.error(
              "[auth] membership load failed, using clientId fallback:",
              membershipError
            );
            loaded = {
              memberships: [],
              clientId: user.clientId,
              engagementMode:
                (user.client?.engagementMode as EngagementMode | undefined) ??
                null,
            };
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role,
            clientId: loaded.clientId,
            developerId: user.developer?.id ?? null,
            engagementMode:
              loaded.engagementMode ??
              (user.client?.engagementMode as EngagementMode | undefined) ??
              null,
            memberships: loaded.memberships,
          };
        } catch (error) {
          console.error("[auth] login failed:", error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.clientId = user.clientId;
        token.developerId = user.developerId;
        token.engagementMode = user.engagementMode ?? null;
        token.memberships = user.memberships ?? [];
        return token;
      }

      // Client switcher / session.update({ clientId })
      if (trigger === "update" && session && typeof session === "object") {
        const nextClientId =
          "clientId" in session
            ? (session as { clientId?: string | null }).clientId
            : undefined;

        if (
          typeof nextClientId === "string" &&
          nextClientId &&
          token.role !== "SYS_ADMIN"
        ) {
          const memberships =
            token.memberships ??
            (await listMembershipsForUser(token.id as string));
          const allowed = memberships.some((m) => m.id === nextClientId);
          if (allowed) {
            token.clientId = nextClientId;
            token.memberships = memberships;
            const active = memberships.find((m) => m.id === nextClientId);
            token.engagementMode = active?.engagementMode ?? "MANAGED";

            await prisma.user.update({
              where: { id: token.id as string },
              data: { clientId: nextClientId },
            });
            await prisma.clientMembership.updateMany({
              where: { userId: token.id as string },
              data: { isPrimary: false },
            });
            await prisma.clientMembership.update({
              where: {
                userId_clientId: {
                  userId: token.id as string,
                  clientId: nextClientId,
                },
              },
              data: { isPrimary: true },
            });
          }
        }
        return token;
      }

      // Light refresh: engagement mode of the active client (body-shopping dual-hat).
      if (
        token.role &&
        token.role !== "SYS_ADMIN" &&
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
        session.user.memberships = token.memberships ?? [];
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
