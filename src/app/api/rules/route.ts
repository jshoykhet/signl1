import { NextResponse } from "next/server";
import { createRule, listRules } from "@/lib/db";
import { jsonError, parseRuleBody } from "@/lib/api";
import { requireDeskUser } from "@/lib/session";
import type { RuleInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json({ rules: listRules(desk.userId) });
}

export async function POST(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  try {
    const body = await request.json();
    const input = parseRuleBody(body) as RuleInput;
    const rule = createRule(desk.userId, input);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create rule");
  }
}
