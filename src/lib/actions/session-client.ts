"use server";

import { auth, assertRole } from "@/lib/auth";
import {
  listMembershipsForUser,
  userHasClientMembership,
  type MembershipClientSummary,
} from "@/lib/client-membership";
import { fail, ok, type ActionResult } from "@/types/actions";
import { z } from "zod";

const switchSchema = z.object({
  clientId: z.string().min(1),
});

export async function getMyClientMemberships(): Promise<
  ActionResult<{
    activeClientId: string | null;
    memberships: MembershipClientSummary[];
  }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "SYS_ADMIN",
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    if (session.user.role === "SYS_ADMIN") {
      return ok({ activeClientId: null, memberships: [] });
    }

    const memberships = await listMembershipsForUser(session.user.id);
    return ok({
      activeClientId: session.user.clientId ?? null,
      memberships,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load memberships";
    return fail(message);
  }
}

/**
 * Persist active client on the user record. Caller must also refresh the JWT
 * via next-auth `session.update({ clientId })`.
 */
export async function switchActiveClient(
  input: z.infer<typeof switchSchema>
): Promise<
  ActionResult<{
    clientId: string;
    engagementMode: string;
    clientName: string;
    clientCode: string;
  }>
> {
  try {
    const session = await auth();
    assertRole(session, [
      "CLIENT_PM",
      "VENDOR_LEAD",
      "VENDOR_AM",
      "DEVELOPER",
    ]);

    const parsed = switchSchema.safeParse(input);
    if (!parsed.success) return fail("Invalid client");

    const allowed = await userHasClientMembership(
      session.user.id,
      parsed.data.clientId
    );
    if (!allowed) {
      return fail("You are not a member of that company");
    }

    const memberships = await listMembershipsForUser(session.user.id);
    const target = memberships.find((m) => m.id === parsed.data.clientId);
    if (!target) return fail("Company not found");

    return ok({
      clientId: target.id,
      engagementMode: target.engagementMode,
      clientName: target.name,
      clientCode: target.code,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to switch company";
    return fail(message);
  }
}
