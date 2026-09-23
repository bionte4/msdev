import { auth } from "@/lib/auth";
import { listProjects } from "@/lib/actions/projects";
import { ProjectCrud } from "@/components/features/projects/project-crud";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const session = await auth();
  const result = await listProjects();

  return (
    <div className="page-stack">
      <PageHeader
        title="Projects"
        description="Client projects · timesheet & scope-swap targets"
        actions={<Badge variant="secondary">{session?.user.role}</Badge>}
      />

      {result.success ? (
        <ProjectCrud
          items={result.data.items}
          permissions={result.data.permissions}
          clients={result.data.clients}
          isSysAdmin={session?.user.role === "SYS_ADMIN"}
        />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}
    </div>
  );
}
