import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listAccessUsers } from "@/lib/actions/access";
import { AccessAdmin } from "@/components/features/access/access-admin";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const session = await auth();
  if (
    !session ||
    (session.user.role !== "SYS_ADMIN" && session.user.role !== "VENDOR_LEAD")
  ) {
    redirect("/capacity");
  }

  const result = await listAccessUsers();

  return (
    <div className="page-stack">
      <PageHeader
        title="User access"
        description="Administration · roles, clients, activate / deactivate"
        actions={<Badge variant="secondary">{session.user.role}</Badge>}
      />
      {result.success ? (
        <AccessAdmin
          items={result.data.items}
          permissions={result.data.permissions}
          clients={result.data.clients}
          roles={result.data.roles}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}
    </div>
  );
}
