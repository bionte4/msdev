import type { EngagementMode, Role } from "@/lib/constants";

/** Roles that may hold memberships on more than one client. */
export const MULTI_CLIENT_ROLES: readonly Role[] = [
  "CLIENT_PM",
  "VENDOR_LEAD",
  "VENDOR_AM",
];

export interface MembershipClientSummary {
  id: string;
  name: string;
  code: string;
  engagementMode: EngagementMode;
  isPrimary: boolean;
}

export function roleAllowsMultiClient(role: Role | string): boolean {
  return MULTI_CLIENT_ROLES.includes(role as Role);
}
