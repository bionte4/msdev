"use client";

import { NotificationBell } from "@/components/layout/notification-bell";
import { ClientSwitcher } from "@/components/layout/client-switcher";
import type { MembershipClientSummary } from "@/lib/membership-types";

export interface DashboardTopbarProps {
  title?: string;
  memberships?: MembershipClientSummary[];
  activeClientId?: string | null;
}

export function DashboardTopbar({
  title = "Governance Portal",
  memberships = [],
  activeClientId = null,
}: DashboardTopbarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
      <p className="hidden text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400 lg:block">
        {title}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <ClientSwitcher
          memberships={memberships}
          activeClientId={activeClientId}
        />
        <NotificationBell />
      </div>
    </div>
  );
}
