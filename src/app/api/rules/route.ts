import { NextResponse } from "next/server";
import { createRule, getMonitorMode, listRules, listRulesForMode } from "@/lib/db";
import { jsonError, parseRuleBody } from "@/lib/api";
import { parseMonitorMode } from "@/lib/monitor-mode";
import { requireDeskUser } from "@/lib/session";
import type { RuleInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const url = new URL(request.url);
  const modeParam = url.searchParams.get("mode");
  const mode = getMonitorMode(desk.userId);
  const rules = modeParam ? listRulesForMode(desk.userId, parseMonitorMode(modeParam)) : listRules(desk.userId);
  return NextResponse.json({ rules, mode: modeParam ? parseMonitorMode(modeParam) : mode });
}

export async function POST(request: Request) {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  try {
    const body = await request.json();
    const input = parseRuleBody(body) as RuleInput;
    if (!input.mode) input.mode = getMonitorMode(desk.userId);
    const rule = createRule(desk.userId, input);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create rule");
  }
}
