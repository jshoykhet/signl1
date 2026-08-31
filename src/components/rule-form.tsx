"use client";

import { useMemo, useState } from "react";
import { QUERY_SYNTAX, compileQuery, normalizeAccounts } from "@/lib/query";
import { DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS } from "@/lib/config";
import { formatInterval } from "@/lib/format";
import type { Rule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type RuleFormValue = {
  name: string;
  enabled: boolean;
  queryInput: string;
  accounts: string;
  pollIntervalSec: number;
  slackWebhookUrl: string;
  genericWebhookUrl: string;
};

export function ruleToForm(rule?: Rule | null): RuleFormValue {
  return {
    name: rule?.name ?? "",
    enabled: rule?.enabled ?? true,
    queryInput: rule?.queryInput ?? "",
    accounts: (rule?.accounts ?? []).join(", "),
    pollIntervalSec: Math.round((rule?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS) / 1000),
    slackWebhookUrl: rule?.slackWebhookUrl ?? "",
    genericWebhookUrl: rule?.genericWebhookUrl ?? "",
  };
}

export function RuleForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: Rule | null;
  submitting?: boolean;
  onSubmit: (value: RuleFormValue) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<RuleFormValue>(() => ruleToForm(initial));
  const compiled = useMemo(
    () => compileQuery({ query: value.queryInput, accounts: value.accounts }),
    [value.queryInput, value.accounts],
  );
  const accounts = normalizeAccounts(value.accounts);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="rule-name">Name</Label>
        <Input
          id="rule-name"
          required
          value={value.name}
          onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))}
          placeholder="Fed Watch"
        />
      </div>
      <label className="flex items-center justify-between gap-3 rounded-md border border-border/80 px-3 py-2">
        <div>
          <div className="text-sm font-medium">Enabled</div>
          <div className="text-xs text-muted-foreground">Disabled rules are skipped by the poller.</div>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(checked) => setValue((v) => ({ ...v, enabled: Boolean(checked) }))}
        />
      </label>
      <div className="grid gap-1.5">
        <Label htmlFor="rule-accounts">Accounts helper (optional)</Label>
        <Input
          id="rule-accounts"
          value={value.accounts}
          onChange={(e) => setValue((v) => ({ ...v, accounts: e.target.value }))}
          placeholder="federalreserve, newyorkfed, nvidia"
        />
        <p className="text-[11px] text-muted-foreground">
          Comma-separated handles. Compiles to {accounts.length ? compileQuery({ accounts }) : "from:user1 OR from:user2"}.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="rule-query">Search query</Label>
        <Textarea
          id="rule-query"
          value={value.queryInput}
          onChange={(e) => setValue((v) => ({ ...v, queryInput: e.target.value }))}
          placeholder='(FOMC OR Powell) lang:en -is:retweet'
          className="min-h-20 font-mono text-xs"
        />
      </div>
      <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2">
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Compiled query</div>
        <code className="mt-1 block font-mono text-[11px] leading-relaxed break-all text-foreground">
          {compiled || "Add a query or at least one account."}
        </code>
      </div>
      <details className="rounded-md border border-border/80 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">X recent-search syntax</summary>
        <ul className="mt-2 space-y-1.5 text-[12px] text-muted-foreground">
          {QUERY_SYNTAX.map((row) => (
            <li key={row.op}>
              <code className="mr-2 font-mono text-[11px] text-foreground">{row.op}</code>
              {row.meaning}
            </li>
          ))}
        </ul>
      </details>
      <div className="grid gap-1.5">
        <Label htmlFor="rule-interval">Poll interval (seconds)</Label>
        <Input
          id="rule-interval"
          type="number"
          min={MIN_POLL_INTERVAL_MS / 1000}
          step={1}
          value={value.pollIntervalSec}
          onChange={(e) =>
            setValue((v) => ({ ...v, pollIntervalSec: Number(e.target.value) }))
          }
        />
        <p className="text-[11px] text-muted-foreground">
          Default 120s. Minimum {formatInterval(MIN_POLL_INTERVAL_MS)} for demos. Live X access is rate-limited — prefer 2 minutes+.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="rule-slack">Slack webhook (optional)</Label>
          <Input
            id="rule-slack"
            type="url"
            value={value.slackWebhookUrl}
            onChange={(e) => setValue((v) => ({ ...v, slackWebhookUrl: e.target.value }))}
            placeholder="https://hooks.slack.com/services/…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rule-hook">Generic webhook (optional)</Label>
          <Input
            id="rule-hook"
            type="url"
            value={value.genericWebhookUrl}
            onChange={(e) => setValue((v) => ({ ...v, genericWebhookUrl: e.target.value }))}
            placeholder="https://example.com/hooks/signal"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Inbox always receives matches. Slack can also fall back to the global <code>SLACK_WEBHOOK_URL</code> env var.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !compiled}>
          {submitting ? "Saving…" : initial ? "Save rule" : "Create rule"}
        </Button>
      </div>
    </form>
  );
}
