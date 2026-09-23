import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();

  if (session) {
    redirect("/capacity");
  }

  return <LoginForm />;
}
