import { auth } from "@/lib/auth";
import { ReportsBoard } from "@/components/features/reports/reports-board";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await auth();
  const role = session?.user.role;
  const canExportAll =
    role === "SYS_ADMIN" ||
    role === "CLIENT_PM" ||
    role === "VENDOR_LEAD" ||
    role === "VENDOR_AM";

  return (
    <div className="page-stack">
      <PageHeader
        title="Reports"
        description="Operational reports · export to Excel (.xlsx)"
        actions={<Badge variant="secondary">{role}</Badge>}
      />
      <ReportsBoard canExportAll={Boolean(canExportAll)} />
    </div>
  );
}
