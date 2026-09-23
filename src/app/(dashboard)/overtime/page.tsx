import { auth } from "@/lib/auth";
import { listOvertimeRequests } from "@/lib/actions/overtime";
import { OvertimePageClient } from "@/components/features/overtime/overtime-page-client";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function OvertimePage() {
  const session = await auth();
  const listResult = await listOvertimeRequests();

  const canSubmit =
    session?.user.role === "DEVELOPER" ||
    session?.user.role === "VENDOR_LEAD" ||
    session?.user.role === "SYS_ADMIN";

  const canReview =
    session?.user.role === "CLIENT_PM" || session?.user.role === "SYS_ADMIN";

  const showForm = canSubmit && Boolean(session?.user.developerId);

  return (
    <div className="page-stack">
      <PageHeader
        title="Overtime approvals"
        description="PENDING → APPROVED_CLIENT / REJECTED_CLIENT"
      />

      {!showForm && canSubmit && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Your account does not have a developer profile linked. Overtime
          requests can only be submitted by linked developers.
        </div>
      )}

      {listResult.success ? (
        <OvertimePageClient
          items={listResult.data}
          showForm={showForm}
          canReview={canReview}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {listResult.error}
        </div>
      )}
    </div>
  );
}
