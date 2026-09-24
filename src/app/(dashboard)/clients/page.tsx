import { auth } from "@/lib/auth";
import { listClients } from "@/lib/actions/clients";
import { ClientCrud } from "@/components/features/clients/client-crud";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRouteRole } from "@/lib/require-route-role";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireRouteRole("/clients");
  const session = await auth();
  const result = await listClients();

  return (
    <div className="page-stack">
      <PageHeader
        title="Clients"
        description="Client organizations · projects & personnel tenant"
        actions={<Badge variant="secondary">{session?.user.role}</Badge>}
      />
      {result.success ? (
        <ClientCrud
          items={result.data.items}
          permissions={result.data.permissions}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}
    </div>
  );
}
