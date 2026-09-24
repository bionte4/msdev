"use client";

import { NotificationBell } from "@/components/layout/notification-bell";

export interface DashboardTopbarProps {
  title?: string;
}

export function DashboardTopbar({ title = "Governance Portal" }: DashboardTopbarProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
      <p className="hidden text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400 lg:block">
        {title}
      </p>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell />
      </div>
    </div>
  );
}
