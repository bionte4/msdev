import {
  getDevelopersForEvaluation,
  listMonthlyEvaluations,
} from "@/lib/actions/evaluations";
import { EvaluationForm } from "@/components/features/evaluations/evaluation-form";
import { EvaluationList } from "@/components/features/evaluations/evaluation-list";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function EvaluationsPage() {
  const [developersResult, listResult] = await Promise.all([
    getDevelopersForEvaluation(),
    listMonthlyEvaluations(),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Monthly evaluations"
        description="Weighted scorecard · Replacement ticket when score < 2.80"
      />

      {developersResult.success ? (
        <EvaluationForm developers={developersResult.data} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {developersResult.error}
        </div>
      )}

      {listResult.success ? (
        <EvaluationList items={listResult.data} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {listResult.error}
        </div>
      )}
    </div>
  );
}
