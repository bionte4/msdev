import type { EngagementMode, Role } from "@/lib/constants";

/**
 * When a client runs BODY_SHOPPING, CLIENT_PM also receives
 * VENDOR_LEAD + VENDOR_AM capabilities (dual-hat for staff aug only).
 */
export function getEffectiveRoles(
  role: Role | string | null | undefined,
  engagementMode?: EngagementMode | string | null
): Role[] {
  if (!role) return [];
  const r = role as Role;
  if (r === "CLIENT_PM" && engagementMode === "BODY_SHOPPING") {
    return ["CLIENT_PM", "VENDOR_LEAD", "VENDOR_AM"];
  }
  return [r];
}

export function hasEffectiveRole(
  role: Role | string | null | undefined,
  engagementMode: EngagementMode | string | null | undefined,
  ...candidates: Role[]
): boolean {
  const effective = getEffectiveRoles(role, engagementMode);
  return candidates.some((c) => effective.includes(c));
}

/** OR-merge boolean permission flags across all effective roles. */
export function mergePerms<T extends object>(
  role: Role | string | null | undefined,
  engagementMode: EngagementMode | string | null | undefined,
  compute: (r: Role) => T
): T {
  const roles = getEffectiveRoles(role, engagementMode);
  if (roles.length === 0) {
    return compute("DEVELOPER");
  }
  const parts = roles.map((r) => compute(r));
  const out = { ...parts[0] } as T;
  for (const part of parts.slice(1)) {
    for (const key of Object.keys(out) as (keyof T)[]) {
      const left = out[key];
      const right = part[key];
      if (typeof left === "boolean" && typeof right === "boolean") {
        (out as Record<string, boolean>)[key as string] = left || right;
      }
    }
  }
  return out;
}
