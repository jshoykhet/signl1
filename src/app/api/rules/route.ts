import { NextResponse } from "next/server";
import { createRule, listRules } from "@/lib/db";
import { jsonError, parseRuleBody } from "@/lib/api";
import type { RuleInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rules: listRules() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseRuleBody(body) as RuleInput;
    const rule = createRule(input);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create rule");
  }
}
