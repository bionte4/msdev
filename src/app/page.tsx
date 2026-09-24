import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/rbac-routes";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }
  redirect(homePathForRole(session.user.role));
}
