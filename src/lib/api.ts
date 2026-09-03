import { NextResponse } from "next/server";
import { clampPollIntervalMs, DEFAULT_POLL_INTERVAL_MS } from "@/lib/config";
import { parseMonitorMode } from "@/lib/monitor-mode";
import { normalizeAccounts } from "@/lib/query";
import type { RuleInput } from "@/lib/types";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function parseRuleBody(body: unknown, partial = false): Partial<RuleInput> {
  if (!body || typeof body !== "object") throw new Error("Expected JSON object");
  const raw = body as Record<string, unknown>;
  const input: Partial<RuleInput> = {};

  if (raw.name !== undefined || !partial) {
    const name = String(raw.name ?? "").trim();
    if (!name) throw new Error("Name is required");
    input.name = name;
  }
  if (raw.enabled !== undefined || !partial) {
    input.enabled = Boolean(raw.enabled ?? true);
  }
  if (raw.queryInput !== undefined || raw.query !== undefined || !partial) {
    input.queryInput = String(raw.queryInput ?? raw.query ?? "");
  }
  if (raw.accounts !== undefined || !partial) {
    input.accounts = normalizeAccounts(raw.accounts as string[] | string | undefined);
  }
  if (raw.pollIntervalMs !== undefined || raw.pollIntervalSec !== undefined || !partial) {
    const ms =
      typeof raw.pollIntervalMs === "number"
        ? raw.pollIntervalMs
        : typeof raw.pollIntervalSec === "number"
          ? raw.pollIntervalSec * 1000
          : DEFAULT_POLL_INTERVAL_MS;
    input.pollIntervalMs = clampPollIntervalMs(ms);
  }
  if (raw.slackWebhookUrl !== undefined || !partial) {
    const url = String(raw.slackWebhookUrl ?? "").trim();
    input.slackWebhookUrl = url || null;
  }
  if (raw.genericWebhookUrl !== undefined || !partial) {
    const url = String(raw.genericWebhookUrl ?? "").trim();
    input.genericWebhookUrl = url || null;
  }
  if (raw.mode !== undefined) {
    input.mode = parseMonitorMode(String(raw.mode));
  }
  return input;
}
