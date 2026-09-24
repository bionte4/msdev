import {
  getMonthlyTicketSummary,
  getTicketFormOptions,
  listTickets,
} from "@/lib/actions/tickets";
import { TicketsBoard } from "@/components/features/tickets/tickets-board";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRouteRole } from "@/lib/require-route-role";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  await requireRouteRole("/tickets");
  const session = await auth();

  const [listResult, optionsResult, summaryResult] = await Promise.all([
    listTickets({}),
    getTicketFormOptions(),
    getMonthlyTicketSummary(),
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        title="Tickets"
        description="Manual + bulk operational tickets · monthly report · optional Jira sync"
        actions={
          <Badge variant="secondary">
            {session?.user.role ?? "—"} · company-scoped
          </Badge>
        }
      />

      {listResult.success && optionsResult.success ? (
        <TicketsBoard
          initialData={listResult.data}
          projects={optionsResult.data.projects}
          assignees={optionsResult.data.assignees}
          summary={summaryResult.success ? summaryResult.data : null}
          currentDeveloperId={session?.user.developerId}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {(!listResult.success && listResult.error) ||
            (!optionsResult.success && optionsResult.error) ||
            "Unable to load tickets"}
        </div>
      )}
    </div>
  );
}
