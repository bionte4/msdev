/**
 * Next.js instrumentation — starts in-process Jira pull scheduler when enabled.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const enabled =
    process.env.JIRA_PULL_SCHEDULER === "true" ||
    process.env.JIRA_PULL_SCHEDULER === "1";
  if (!enabled) return;

  const { startJiraPullScheduler } = await import(
    "@/lib/jira/pull-scheduler"
  );
  startJiraPullScheduler();
}
