"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { homePathForRole } from "@/lib/rbac-routes";

interface DemoAccount {
  label: string;
  email: string;
  role: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: "Client PM", email: "pm@acme.example", role: "CLIENT_PM" },
  { label: "Developer", email: "developer@acme.example", role: "DEVELOPER" },
  { label: "Vendor Lead", email: "lead@acme.example", role: "VENDOR_LEAD" },
  { label: "Vendor AM", email: "am@acme.example", role: "VENDOR_AM" },
  { label: "Admin", email: "admin@acme.example", role: "SYS_ADMIN" },
];

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("pm@acme.example");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);

  async function authenticate(nextEmail: string, nextPassword: string) {
    setLoading(true);

    const result = await signIn("credentials", {
      email: nextEmail,
      password: nextPassword,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      toast.error("Invalid email or password");
      return;
    }

    toast.success("Signed in");
    const session = await getSession();
    router.push(homePathForRole(session?.user?.role));
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await authenticate(email, password);
  }

  async function handleQuickLogin(account: DemoAccount) {
    setEmail(account.email);
    setPassword("password123");
    await authenticate(account.email, "password123");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-3 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Sign in</CardTitle>
          <CardDescription>
            Governance Portal · local development
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Quick login · password123
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto flex-col items-start gap-0 px-2 py-1.5 text-left"
                  disabled={loading}
                  onClick={() => handleQuickLogin(account)}
                >
                  <span className="text-[12px] font-medium">{account.label}</span>
                  <span className="text-[10px] font-normal text-slate-500">
                    {account.role}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
