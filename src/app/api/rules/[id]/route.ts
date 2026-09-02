import { NextResponse } from "next/server";
import { deleteRule, getRule, updateRule } from "@/lib/db";
import { jsonError, parseRuleBody } from "@/lib/api";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const { id } = await context.params;
  const rule = getRule(id, desk.userId);
  if (!rule) return jsonError("Rule not found", 404);
  return NextResponse.json({ rule });
}

export async function PATCH(request: Request, context: Ctx) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const { id } = await context.params;
  try {
    const body = await request.json();
    const input = parseRuleBody(body, true);
    const rule = updateRule(id, input, desk.userId);
    return NextResponse.json({ rule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update rule";
    return jsonError(message, message === "Rule not found" ? 404 : 400);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const { id } = await context.params;
  try {
    if (!deleteRule(id, desk.userId)) return jsonError("Rule not found", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete rule";
    return jsonError(message, message === "Rule not found" ? 404 : 400);
  }
}
