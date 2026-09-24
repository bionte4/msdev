import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";
import type { EngagementMode, Role } from "@/lib/constants";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      clientId?: string | null;
      developerId?: string | null;
      engagementMode?: EngagementMode | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: Role;
    clientId?: string | null;
    developerId?: string | null;
    engagementMode?: EngagementMode | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: Role;
    clientId?: string | null;
    developerId?: string | null;
    engagementMode?: EngagementMode | null;
  }
}
