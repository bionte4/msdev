import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getActiveProjectsForTimesheet,
  getWeeklyTimesheetSummary,
} from "@/lib/actions/timesheets";
import { getWeeklyCapacityDashboard } from "@/lib/actions/capacity";
import { TimesheetForm } from "@/components/features/timesheets/timesheet-form";
import { TimesheetWeekSummary } from "@/components/features/timesheets/timesheet-week-summary";
import { CapacityDashboard } from "@/components/features/capacity/capacity-dashboard";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function TimesheetsPage() {
  const session = await auth();
  const hasDeveloperProfile = Boolean(session?.user.developerId);
  const isDeveloperRole = session?.user.role === "DEVELOPER";

  if (hasDeveloperProfile) {
    const [projectsResult, summaryResult] = await Promise.all([
      getActiveProjectsForTimesheet(),
      getWeeklyTimesheetSummary(),
    ]);

    return (
      <div className="page-stack">
        <PageHeader
          title="Timesheets"
          description="Daily max 16h · Weekly warning 45h · Hard cap 50h"
        />

        {projectsResult.success ? (
          <TimesheetForm projects={projectsResult.data} />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {projectsResult.error}
          </div>
        )}

        {summaryResult.success ? (
          <TimesheetWeekSummary summary={summaryResult.data} />
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {summaryResult.error}
          </div>
        )}
      </div>
    );
  }

  const teamResult = await getWeeklyCapacityDashboard();

  return (
    <div className="page-stack">
      <PageHeader
        title="Team timesheets"
        description={`Signed in as ${session?.user.role}. Logging hours requires a developer account.`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/capacity">Capacity</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login">Switch account</Link>
            </Button>
          </>
        }
      />

      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600">
        {isDeveloperRole
          ? "Your user is missing a linked developer profile. Ask an admin to link it."
          : "To submit your own worklog, sign in as DEVELOPER (developer@acme.example)."}
      </div>

      {teamResult.success ? (
        <CapacityDashboard data={teamResult.data} hideHeader />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {teamResult.error}
        </div>
      )}
    </div>
  );
}
