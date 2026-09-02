import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/config";
import { getMeta, requestManualPoll } from "@/lib/db";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const lastPollAt = getMeta("poller_last_poll_at");
  const { requestedAt } = requestManualPoll();
  return NextResponse.json({
    ok: true,
    requestedAt,
    lastPollAt,
    demoMode: isDemoMode(),
  });
}
