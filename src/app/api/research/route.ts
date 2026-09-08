import { NextResponse } from "next/server";
import { runResearch } from "@/lib/research";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lastAt = new Map<string, number>();

export async function POST(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const body = (await request.json().catch(() => ({}))) as { question?: string };
  const question = typeof body.question === "string" ? body.question : "";
  const prev = lastAt.get(desk.userId) ?? 0;
  if (Date.now() - prev < 8000) {
    return NextResponse.json({ error: "Wait a few seconds between research asks." }, { status: 429 });
  }
  lastAt.set(desk.userId, Date.now());
  try {
    const result = await runResearch(question);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
