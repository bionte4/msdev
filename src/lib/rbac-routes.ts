import type { EngagementMode, Role } from "@/lib/constants";
import { getEffectiveRoles, hasEffectiveRole } from "@/lib/effective-roles";

/** Default landing path after login / unauthorized page hit. */
export function homePathForRole(role: Role | string | null | undefined): string {
  switch (role) {
    case "DEVELOPER":
      return "/timesheets";
    case "SYS_ADMIN":
    case "CLIENT_PM":
    case "VENDOR_LEAD":
    case "VENDOR_AM":
      return "/capacity";
    default:
      return "/login";
  }
}

/** Roles allowed to open each dashboard route (must stay in sync with sidebar). */
export const ROUTE_ROLES: Record<string, readonly Role[]> = {
  "/capacity": ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD", "VENDOR_AM"],
  "/clients": ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD", "VENDOR_AM"],
  "/projects": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/personnel": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/coverage": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/development": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/timesheets": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/overtime": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/evaluations": ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD", "VENDOR_AM"],
  "/leaderboard": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/scope-swaps": ["SYS_ADMIN", "CLIENT_PM", "VENDOR_LEAD", "VENDOR_AM"],
  "/reports": [
    "SYS_ADMIN",
    "CLIENT_PM",
    "VENDOR_LEAD",
    "VENDOR_AM",
    "DEVELOPER",
  ],
  "/access": ["SYS_ADMIN", "VENDOR_LEAD"],
  "/integrations": ["SYS_ADMIN", "VENDOR_LEAD"],
};

export function canAccessRoute(
  role: Role | string | null | undefined,
  path: string,
  engagementMode?: EngagementMode | string | null
): boolean {
  if (!role) return false;
  const allowed = ROUTE_ROLES[path];
  if (!allowed) return true;
  return getEffectiveRoles(role, engagementMode).some((r) =>
    (allowed as readonly string[]).includes(r)
  );
}

export { getEffectiveRoles, hasEffectiveRole };
