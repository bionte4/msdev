import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen lg:flex">
      <AppSidebar
        userName={session.user.name}
        userEmail={session.user.email}
        userRole={session.user.role}
        engagementMode={session.user.engagementMode}
      />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
          <DashboardTopbar
            memberships={session.user.memberships ?? []}
            activeClientId={session.user.clientId ?? null}
          />
          {children}
        </div>
      </main>
    </div>
  );
}
