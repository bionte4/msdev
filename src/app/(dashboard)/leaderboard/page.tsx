import { auth } from "@/lib/auth";
import { getLeaderboard } from "@/lib/actions/leaderboard";
import { LeaderboardBoard } from "@/components/features/leaderboard/leaderboard-board";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await auth();
  const now = new Date();
  const result = await getLeaderboard({
    metric: "evaluation",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="Leaderboard"
        description="Developer ranking by evaluation, rewards, or hours"
        actions={<Badge variant="secondary">{session?.user.role}</Badge>}
      />
      {result.success ? (
        <LeaderboardBoard initialData={result.data} />
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {result.error}
        </div>
      )}
    </div>
  );
}
