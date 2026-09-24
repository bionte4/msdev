import { getWeeklyCapacityDashboard } from "@/lib/actions/capacity";
import { CapacityDashboard } from "@/components/features/capacity/capacity-dashboard";
import { requireRouteRole } from "@/lib/require-route-role";

export const dynamic = "force-dynamic";

export default async function CapacityPage() {
  await requireRouteRole("/capacity");
  const result = await getWeeklyCapacityDashboard();

  if (!result.success) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="text-lg font-semibold">Unable to load capacity</h1>
        <p className="mt-1 text-sm">{result.error}</p>
      </div>
    );
  }

  return <CapacityDashboard data={result.data} />;
}
