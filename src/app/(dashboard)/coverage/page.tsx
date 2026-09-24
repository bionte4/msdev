import { auth } from "@/lib/auth";
import { listCoverages } from "@/lib/actions/coverage";
import { CoverageCrud } from "@/components/features/coverage/coverage-crud";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRouteRole } from "@/lib/require-route-role";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  await requireRouteRole("/coverage");
  const session = await auth();
  const result = await listCoverages();

  return (
    <div className="page-stack">
      <PageHeader
        title="Coverage"
        description="Pengganti sakit / cuti · start & end date"
        actions={<Badge variant="secondary">{session?.user.role}</Badge>}
      />
      {result.success ? (
        <CoverageCrud
          items={result.data.items}
          permissions={result.data.permissions}
          projects={result.data.projects}
          developers={result.data.developers}
          leaveOptions={result.data.leaveOptions}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}
    </div>
  );
}
