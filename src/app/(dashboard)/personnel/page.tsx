import { auth } from "@/lib/auth";
import { listPersonnel } from "@/lib/actions/personnel";
import { listLeaveRequests } from "@/lib/actions/leave";
import { getDevelopersForTimesheet } from "@/lib/actions/timesheets";
import { PersonnelCrud } from "@/components/features/personnel/personnel-crud";
import { LeaveCrud } from "@/components/features/personnel/leave-crud";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRouteRole } from "@/lib/require-route-role";

export const dynamic = "force-dynamic";

export default async function PersonnelPage() {
  await requireRouteRole("/personnel");
  const session = await auth();

  const [personnelResult, leaveResult, developersResult] = await Promise.all([
    listPersonnel(),
    listLeaveRequests(),
    session?.user.role === "DEVELOPER"
      ? Promise.resolve({ success: true as const, data: [] })
      : getDevelopersForTimesheet(),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Personnel"
        description="Developer roster · cuti / sakit / unpaid leave"
        actions={
          <Badge variant="secondary">{session?.user.role}</Badge>
        }
      />

      {personnelResult.success ? (
        <PersonnelCrud
          items={personnelResult.data.items}
          permissions={personnelResult.data.permissions}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {personnelResult.error}
        </div>
      )}

      {leaveResult.success ? (
        <LeaveCrud
          items={leaveResult.data.items}
          permissions={leaveResult.data.permissions}
          developers={developersResult.success ? developersResult.data : []}
          currentDeveloperId={session?.user.developerId}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {leaveResult.error}
        </div>
      )}
    </div>
  );
}
