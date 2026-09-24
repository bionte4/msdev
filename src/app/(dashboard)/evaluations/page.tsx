import { auth } from "@/lib/auth";
import {
  getDevelopersForEvaluation,
  listMonthlyEvaluations,
} from "@/lib/actions/evaluations";
import { EvaluationForm } from "@/components/features/evaluations/evaluation-form";
import { EvaluationList } from "@/components/features/evaluations/evaluation-list";
import { PageHeader } from "@/components/layout/page-header";
import { requireRouteRole } from "@/lib/require-route-role";

export const dynamic = "force-dynamic";

export default async function EvaluationsPage() {
  await requireRouteRole("/evaluations");
  const session = await auth();
  const canSubmit =
    session?.user.role === "CLIENT_PM" || session?.user.role === "SYS_ADMIN";

  const [developersResult, listResult] = await Promise.all([
    canSubmit
      ? getDevelopersForEvaluation()
      : Promise.resolve({ success: true as const, data: [] }),
    listMonthlyEvaluations(),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Monthly evaluations"
        description="Weighted scorecard · Replacement ticket when score < 2.80"
      />

      {canSubmit &&
        (developersResult.success ? (
          <EvaluationForm developers={developersResult.data} />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {developersResult.error}
          </div>
        ))}

      {!canSubmit && (
        <p className="text-[12px] text-slate-500">
          View-only · evaluation submission is limited to Client PM.
        </p>
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
