import { auth } from "@/lib/auth";
import {
  getScopeSwapFormOptions,
  listScopeSwaps,
} from "@/lib/actions/scope-swaps";
import { ScopeSwapForm } from "@/components/features/scope-swaps/scope-swap-form";
import { ScopeSwapList } from "@/components/features/scope-swaps/scope-swap-list";
import { PageHeader } from "@/components/layout/page-header";
import { requireRouteRole } from "@/lib/require-route-role";
import { hasEffectiveRole } from "@/lib/effective-roles";

export const dynamic = "force-dynamic";

export default async function ScopeSwapsPage() {
  await requireRouteRole("/scope-swaps");
  const session = await auth();
  const canCreate = hasEffectiveRole(
    session?.user.role,
    session?.user.engagementMode,
    "CLIENT_PM",
    "VENDOR_LEAD",
    "SYS_ADMIN"
  );

  const [optionsResult, listResult] = await Promise.all([
    canCreate
      ? getScopeSwapFormOptions()
      : Promise.resolve({
          success: true as const,
          data: { projects: [], developers: [] },
        }),
    listScopeSwaps(),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Scope swaps"
        description="1-in / 1-out with equal story points and hours"
      />

      {canCreate &&
        (optionsResult.success ? (
          <ScopeSwapForm
            projects={optionsResult.data.projects}
            developers={optionsResult.data.developers}
          />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {optionsResult.error}
          </div>
        ))}

      {!canCreate && (
        <p className="text-[12px] text-slate-500">
          View-only · creating scope swaps is limited to Client PM and Vendor
          Lead.
        </p>
      )}

      {listResult.success ? (
        <ScopeSwapList items={listResult.data} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {listResult.error}
        </div>
      )}
    </div>
  );
}
