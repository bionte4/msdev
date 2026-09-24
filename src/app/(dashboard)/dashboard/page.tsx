import { getHomeDashboard } from "@/lib/actions/dashboard";
import { HomeDashboard } from "@/components/features/dashboard/home-dashboard";
import { requireRouteRole } from "@/lib/require-route-role";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireRouteRole("/dashboard");
  const result = await getHomeDashboard();

  if (!result.success) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="text-lg font-semibold">Unable to load dashboard</h1>
        <p className="mt-1 text-sm">{result.error}</p>
      </div>
    );
  }

  return <HomeDashboard data={result.data} />;
}
