import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { getMeta, requestManualPoll } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const lastPollAt = getMeta("poller_last_poll_at");
  const { requestedAt } = requestManualPoll();
  return NextResponse.json({
    ok: true,
    requestedAt,
    lastPollAt,
    demoMode: isDemoMode(),
  });
}
