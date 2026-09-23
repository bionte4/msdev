import { auth } from "@/lib/auth";
import { listIntegrations } from "@/lib/actions/integrations";
import { IntegrationsBoard } from "@/components/features/integrations/integrations-board";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const session = await auth();
  const result = await listIntegrations();
  const canEdit = session?.user.role === "SYS_ADMIN";

  return (
    <div className="page-stack">
      <PageHeader
        title="Integrations"
        description="Email, SMTP, Jira, and ServiceNow for notifications and ticket sync"
      />

      {result.success ? (
        <IntegrationsBoard initialItems={result.data} canEdit={canEdit} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}
    </div>
  );
}
