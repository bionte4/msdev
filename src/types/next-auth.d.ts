import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";
import type { EngagementMode, Role } from "@/lib/constants";
import type { MembershipClientSummary } from "@/lib/membership-types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      clientId?: string | null;
      developerId?: string | null;
      engagementMode?: EngagementMode | null;
      memberships?: MembershipClientSummary[];
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: Role;
    clientId?: string | null;
    developerId?: string | null;
    engagementMode?: EngagementMode | null;
    memberships?: MembershipClientSummary[];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: Role;
    clientId?: string | null;
    developerId?: string | null;
    engagementMode?: EngagementMode | null;
    memberships?: MembershipClientSummary[];
  }
}
