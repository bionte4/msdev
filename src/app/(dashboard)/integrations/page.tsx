import { auth } from "@/lib/auth";
import {
  listClientJiraConfigs,
  listIntegrations,
} from "@/lib/actions/integrations";
import { ClientJiraBoard } from "@/components/features/integrations/client-jira-board";
import { IntegrationsBoard } from "@/components/features/integrations/integrations-board";
import { PageHeader } from "@/components/layout/page-header";
import { requireRouteRole } from "@/lib/require-route-role";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await requireRouteRole("/integrations");
  const session = await auth();
  const [result, clientJira] = await Promise.all([
    listIntegrations(),
    listClientJiraConfigs(),
  ]);
  const canEdit = session?.user.role === "SYS_ADMIN";

  return (
    <div className="page-stack">
      <PageHeader
        title="Integrations"
        description="Global connectors + per-company Jira sites for multi-tenant ticket sync"
      />

      {result.success ? (
        <IntegrationsBoard initialItems={result.data} canEdit={canEdit} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}

      {clientJira.success ? (
        <ClientJiraBoard initialItems={clientJira.data} canEdit={canEdit} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {clientJira.error}
        </div>
      )}
    </div>
  );
}
