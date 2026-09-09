import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { runDiet } from "@/lib/diet-run";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lastAt = new Map<string, number>();

export async function GET(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  const prev = lastAt.get(desk.userId) ?? 0;
  if (Date.now() - prev < 10_000) {
    return jsonError("Wait a few seconds between reads. Each one is two X searches.", 429);
  }
  lastAt.set(desk.userId, Date.now());
  try {
    const report = await runDiet(handle);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read that handle.";
    const status = /Wait a few|Enter an X handle/i.test(message) ? 400 : 502;
    lastAt.delete(desk.userId);
    return jsonError(message, status);
  }
}
