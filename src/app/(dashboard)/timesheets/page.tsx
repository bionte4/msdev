import { auth } from "@/lib/auth";
import {
  getActiveProjectsForTimesheet,
  getDevelopersForTimesheet,
  listTimesheets,
} from "@/lib/actions/timesheets";
import { TimesheetCrud } from "@/components/features/timesheets/timesheet-crud";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRouteRole } from "@/lib/require-route-role";
import { hasEffectiveRole } from "@/lib/effective-roles";

export const dynamic = "force-dynamic";

function roleHint(
  role: string | undefined,
  engagementMode: string | null | undefined
): string {
  if (role === "DEVELOPER") return "CRUD own entries only";
  if (
    hasEffectiveRole(role, engagementMode, "VENDOR_LEAD", "SYS_ADMIN")
  ) {
    return "CRUD team entries · can assign developer";
  }
  if (role === "CLIENT_PM" || role === "VENDOR_AM") {
    return "Read-only team view";
  }
  return "Role-based access";
}

export default async function TimesheetsPage() {
  await requireRouteRole("/timesheets");
  const session = await auth();
  const canMutate = hasEffectiveRole(
    session?.user.role,
    session?.user.engagementMode,
    "DEVELOPER",
    "VENDOR_LEAD",
    "SYS_ADMIN"
  );

  const [listResult, projectsResult, developersResult] = await Promise.all([
    listTimesheets({}),
    canMutate
      ? getActiveProjectsForTimesheet()
      : Promise.resolve({ success: true as const, data: [] }),
    session?.user.role === "DEVELOPER"
      ? Promise.resolve({ success: true as const, data: [] })
      : getDevelopersForTimesheet(),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Timesheets"
        description="Daily max 16h · Weekly warning 45h · Hard cap 50h"
        actions={
          <Badge variant="secondary">
            {roleHint(session?.user.role, session?.user.engagementMode)}
          </Badge>
        }
      />

      {listResult.success ? (
        <TimesheetCrud
          initialData={listResult.data}
          projects={projectsResult.success ? projectsResult.data : []}
          developers={developersResult.success ? developersResult.data : []}
          currentDeveloperId={session?.user.developerId}
          permissions={listResult.data.permissions}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {listResult.error}
        </div>
      )}

      {!projectsResult.success && canMutate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {projectsResult.error}
        </div>
      )}
    </div>
  );
}
