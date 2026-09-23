import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { developer: true },
        });

        if (!user?.passwordHash) {
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
        };
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.clientId = token.clientId;
        session.user.developerId = token.developerId;
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
  if (!session || !allowed.includes(session.user.role)) {
    throw new Error("Unauthorized access");
  }
}
