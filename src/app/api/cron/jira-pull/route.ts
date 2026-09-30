import { NextResponse } from "next/server";
import { runScheduledJiraPull } from "@/lib/jira/scheduled-pull";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Unauthorized. Set CRON_SECRET and call with Authorization: Bearer <secret>.",
      },
      { status: 401 }
    );
  }

  try {
    const result = await runScheduledJiraPull({ maxResultsPerProject: 50 });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scheduled Jira pull failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/** External cron / curl: GET or POST /api/cron/jira-pull */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
