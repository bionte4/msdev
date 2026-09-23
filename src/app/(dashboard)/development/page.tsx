import { getDevelopmentBoard } from "@/lib/actions/development";
import { DevelopmentBoard } from "@/components/features/development/development-board";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  const session = await auth();
  const result = await getDevelopmentBoard();

  return (
    <div className="page-stack">
      <PageHeader
        title="Development"
        description="Skillset · training · coaching · reward & punishment"
        actions={<Badge variant="secondary">{session?.user.role}</Badge>}
      />

      {result.success ? (
        <DevelopmentBoard data={result.data} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}
    </div>
  );
}
