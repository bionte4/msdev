import { runScheduledJiraPull } from "@/lib/jira/scheduled-pull";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var __msdevJiraPullSchedulerStarted: boolean | undefined;
}

/**
 * In-process interval (dev / single-node production).
 * Prefer external cron hitting /api/cron/jira-pull for multi-instance deploys.
 */
export function startJiraPullScheduler(): void {
  if (global.__msdevJiraPullSchedulerStarted) return;
  global.__msdevJiraPullSchedulerStarted = true;

  const raw = process.env.JIRA_PULL_INTERVAL_MS;
  const intervalMs = Math.max(
    Number(raw) > 0 ? Number(raw) : DEFAULT_INTERVAL_MS,
    60_000
  );

  console.info(
    `[jira-pull] scheduler started · every ${Math.round(intervalMs / 60000)} min`
  );

  const tick = async () => {
    try {
      const result = await runScheduledJiraPull({ maxResultsPerProject: 50 });
      console.info(
        `[jira-pull] ${result.ranAt} · companies=${result.companies} projects=${result.projects} +${result.imported} ~${result.updated} skip=${result.skipped}`
      );
      if (result.errors[0]) {
        console.warn(`[jira-pull] ${result.errors[0]}`);
      }
    } catch (error) {
      console.error(
        "[jira-pull] failed",
        error instanceof Error ? error.message : error
      );
    }
  };

  // First run after 45s (let app finish boot), then on interval.
  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, intervalMs);
  }, 45_000);
}
