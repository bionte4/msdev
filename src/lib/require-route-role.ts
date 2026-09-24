import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canAccessRoute, homePathForRole } from "@/lib/rbac-routes";

/** Server-page guard: redirect when role is not allowed for this route. */
export async function requireRouteRole(path: string): Promise<void> {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }
  if (!canAccessRoute(session.user.role, path)) {
    redirect(homePathForRole(session.user.role));
  }
}
