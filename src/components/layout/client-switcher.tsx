"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { switchActiveClient } from "@/lib/actions/session-client";
import type { MembershipClientSummary } from "@/lib/membership-types";

export interface ClientSwitcherProps {
  memberships: MembershipClientSummary[];
  activeClientId: string | null;
}

export function ClientSwitcher({
  memberships,
  activeClientId,
}: ClientSwitcherProps) {
  const { update } = useSession();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    if (memberships.length === 1) {
      return (
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
          <Building2 className="h-3 w-3 shrink-0 opacity-70" />
          <span className="max-w-[140px] truncate sm:max-w-[200px]">
            {memberships[0].name}
            <span className="text-slate-400"> · {memberships[0].code}</span>
          </span>
        </div>
      );
    }
    return null;
  }

  function onChange(clientId: string) {
    if (clientId === activeClientId) return;
    startTransition(async () => {
      const result = await switchActiveClient({ clientId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await update({ clientId: result.data.clientId });
      toast.success(
        `Switched to ${result.data.clientName} (${result.data.clientCode})`
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {isPending && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
      )}
      <Select
        value={activeClientId ?? undefined}
        onValueChange={onChange}
        disabled={isPending}
      >
        <SelectTrigger className="h-8 w-[min(100%,220px)] text-[11px]">
          <Building2 className="mr-1 h-3 w-3 shrink-0 opacity-70" />
          <SelectValue placeholder="Company" />
        </SelectTrigger>
        <SelectContent>
          {memberships.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-[12px]">
              {m.name} ({m.code})
              {m.isPrimary ? " · primary" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
