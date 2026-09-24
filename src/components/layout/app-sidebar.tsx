"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Clock,
  ClipboardCheck,
  ArrowLeftRight,
  Timer,
  Plug,
  Users,
  GraduationCap,
  FolderKanban,
  FileSpreadsheet,
  Building2,
  UserRoundCog,
  Menu,
  X,
  LogOut,
  Loader2,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/capacity", label: "Capacity", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/personnel", label: "Personnel", icon: Users },
  { href: "/coverage", label: "Coverage", icon: UserRoundCog },
  { href: "/development", label: "Development", icon: GraduationCap },
  { href: "/timesheets", label: "Timesheets", icon: Clock },
  { href: "/overtime", label: "Overtime", icon: Timer },
  { href: "/evaluations", label: "Evaluations", icon: ClipboardCheck },
  { href: "/scope-swaps", label: "Scope swaps", icon: ArrowLeftRight },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/integrations", label: "Integrations", icon: Plug },
] as const;

export interface AppSidebarProps {
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
}

export function AppSidebar({
  userName,
  userEmail,
  userRole,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();

  function handleSignOut() {
    startSignOut(async () => {
      toast.success("Signed out");
      await signOut({ callbackUrl: "/login" });
    });
  }

  return (
    <>
      <div className="sticky top-0 z-40 flex h-11 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur lg:hidden">
        <span className="text-[13px] font-semibold text-slate-900">
          Governance Portal
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="Sign out"
          >
            {isSigningOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-slate-100 px-3.5 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Outsourcing
          </p>
          <p className="mt-0.5 text-[14px] font-semibold leading-tight text-slate-900">
            Governance Portal
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-slate-100 p-2.5">
          <div className="rounded-md bg-slate-50 px-2.5 py-2">
            <p className="truncate text-[12px] font-semibold text-slate-900">
              {userName ?? "Guest"}
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {userRole ?? "Unauthenticated"}
            </p>
            {userEmail && (
              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                {userEmail}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full justify-start gap-1.5"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Sign out
          </Button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
