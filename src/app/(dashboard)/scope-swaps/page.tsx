import {
  getScopeSwapFormOptions,
  listScopeSwaps,
} from "@/lib/actions/scope-swaps";
import { ScopeSwapForm } from "@/components/features/scope-swaps/scope-swap-form";
import { ScopeSwapList } from "@/components/features/scope-swaps/scope-swap-list";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function ScopeSwapsPage() {
  const [optionsResult, listResult] = await Promise.all([
    getScopeSwapFormOptions(),
    listScopeSwaps(),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Scope swaps"
        description="1-in / 1-out with equal story points and hours"
      />

      {optionsResult.success ? (
        <ScopeSwapForm
          projects={optionsResult.data.projects}
          developers={optionsResult.data.developers}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {optionsResult.error}
        </div>
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
