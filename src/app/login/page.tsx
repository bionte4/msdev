import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/rbac-routes";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    redirect(homePathForRole(session.user.role));
  }

  return <LoginForm />;
}
