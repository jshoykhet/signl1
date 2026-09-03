"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { HandleTable } from "@/components/handle-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { X_MAX_QUERY_CHARS } from "@/lib/config";
import { buildHandleListItems, seedAccountsForMonitor } from "@/lib/handle-list";
import { QUERY_SYNTAX, compileQuery, normalizeAccounts } from "@/lib/query";
import type { Rule } from "@/lib/types";

export type RuleFormValue = {
  name: string;
  enabled: boolean;
  queryInput: string;
  accounts: string[];
  slackWebhookUrl: string;
  genericWebhookUrl: string;
};

export function ruleToForm(rule?: Rule | null): RuleFormValue {
  return {
    name: rule?.name ?? "",
    enabled: rule?.enabled ?? true,
    queryInput: rule?.queryInput ?? "",
    accounts: [...(rule?.accounts ?? [])],
    slackWebhookUrl: rule?.slackWebhookUrl ?? "",
    genericWebhookUrl: rule?.genericWebhookUrl ?? "",
  };
}

const fieldClass =
  "h-8 border-0 bg-transparent px-0 text-right text-[17px] shadow-none focus-visible:border-transparent focus-visible:ring-0";

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
  const seed = useMemo(() => seedAccountsForMonitor(initial?.name), [initial?.name]);
  const [value, setValue] = useState<RuleFormValue>(() => ruleToForm(initial));
  const [followers, setFollowers] = useState<Record<string, number>>({});
  const [queryOpen, setQueryOpen] = useState(() => !(initial?.accounts.length));

  const compiled = useMemo(
    () => compileQuery({ query: value.queryInput, accounts: value.accounts }),
    [value.queryInput, value.accounts],
  );
  const overBudget = compiled.length > X_MAX_QUERY_CHARS;
  const items = useMemo(
    () => buildHandleListItems(seed, value.accounts, followers),
    [seed, value.accounts, followers],
  );
  const accountWatch = value.accounts.length > 0 || seed.length > 0;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/authors", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { followers?: Record<string, number> };
        if (!cancelled && data.followers) setFollowers(data.followers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const setAccounts = (accounts: string[]) => setValue((v) => ({ ...v, accounts }));

  const addHandles = (raw: string): boolean => {
    const incoming = normalizeAccounts(raw);
    if (incoming.length === 0) {
      toast.error("Use a valid X handle (letters, numbers, underscore).");
      return false;
    }
    const current = new Set(value.accounts);
    const fresh = incoming.filter((handle) => !current.has(handle));
    if (fresh.length === 0) {
      toast.error("That handle is already on this monitor.");
      return false;
    }
    setAccounts([...value.accounts, ...fresh]);
    toast.success(fresh.length === 1 ? `@${fresh[0]} added` : `${fresh.length} accounts added`);
    return true;
  };

  const removeHandle = (handle: string) => {
    setAccounts(value.accounts.filter((item) => item !== handle));
  };

  const restoreHandle = (handle: string) => {
    if (value.accounts.includes(handle)) return;
    setAccounts([...value.accounts, handle]);
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!compiled || overBudget) return;
        onSubmit(value);
      }}
    >
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-2">
        <SettingsGroup>
          <GroupedRow>
            <div className="w-[5.5rem] shrink-0 text-[15px] text-muted-foreground">Name</div>
            <Input
              id="rule-name"
              required
              value={value.name}
              onChange={(e) => setValue((v) => ({ ...v, name: e.target.value }))}
              placeholder="Fed"
              className={fieldClass}
            />
          </GroupedRow>
          <GroupedRow>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-medium tracking-[-0.01em]">Enabled</div>
              <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                Off skips this monitor on each poll.
              </div>
            </div>
            <Switch
              checked={value.enabled}
              aria-label="Enable monitor"
              onCheckedChange={(checked) => setValue((v) => ({ ...v, enabled: Boolean(checked) }))}
            />
          </GroupedRow>
        </SettingsGroup>

        <HandleTable
          title="Accounts"
          description={
            accountWatch
              ? "Seeded handles can be removed and restored. Follower counts come from posts already on this desk."
              : "Optional. Add X handles to watch people instead of keywords. Leave empty for a search-only monitor like Fed or Macro."
          }
          items={items}
          emptyLabel={
            seed.length
              ? "No handles yet. Reset to restore the seed list."
              : "No handles yet. Add a row to watch accounts."
          }
          addAriaLabel="Add account handle"
          onAdd={addHandles}
          onRemove={removeHandle}
          onRestore={restoreHandle}
          onReset={
            seed.length
              ? () => {
                  setAccounts([...seed]);
                  toast.success("Accounts reset to defaults");
                }
              : undefined
          }
        />

        <SettingsGroup
          title={accountWatch ? "Filters" : "Search"}
          footer={
            accountWatch
              ? "Applied on top of from: those accounts. lang:en -is:retweet is typical."
              : "Official X recent-search operators. The poller sends the compiled string as-is."
          }
        >
          <GroupedRow className="flex-col items-stretch gap-2 py-3">
            <Textarea
              id="rule-query"
              value={value.queryInput}
              onChange={(e) => setValue((v) => ({ ...v, queryInput: e.target.value }))}
              placeholder={accountWatch ? "lang:en -is:retweet" : '(FOMC OR Powell) lang:en -is:retweet'}
              className="min-h-[4.5rem] rounded-xl border-0 bg-muted/60 font-mono text-[13px] shadow-none focus-visible:ring-0"
            />
          </GroupedRow>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setQueryOpen((open) => !open)}
            aria-expanded={queryOpen}
          >
            <span className="text-[15px]">Compiled query</span>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {compiled ? `${compiled.length} / ${X_MAX_QUERY_CHARS}` : "Add accounts or a query"}
              <ChevronDown className={`size-4 transition-transform ${queryOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {queryOpen ? (
            <div className="border-t border-border px-4 py-3">
              <code className="block font-mono text-[13px] leading-relaxed break-all text-muted-foreground">
                {compiled || "Add a query or at least one account."}
              </code>
              {overBudget ? (
                <p className="mt-2 text-[13px] text-destructive">
                  Over the {X_MAX_QUERY_CHARS}-character X recent-search limit. Remove accounts or shorten the filter.
                </p>
              ) : null}
            </div>
          ) : null}
          <details className="border-t border-border">
            <summary className="cursor-pointer px-4 py-3 text-[15px]">X recent-search syntax</summary>
            <ul className="space-y-1.5 px-4 pb-3 text-[13px] text-muted-foreground">
              {QUERY_SYNTAX.map((row) => (
                <li key={row.op}>
                  <code className="mr-2 font-mono text-[12px] text-foreground">{row.op}</code>
                  {row.meaning}
                </li>
              ))}
            </ul>
          </details>
        </SettingsGroup>

        <SettingsGroup
          title="Alerts"
          footer="Inbox always receives matches. WhatsApp uses the Settings interval, not one message per match."
        >
          <GroupedRow>
            <div className="w-[4.5rem] shrink-0 text-[15px] text-muted-foreground">Slack</div>
            <Input
              id="rule-slack"
              type="url"
              value={value.slackWebhookUrl}
              onChange={(e) => setValue((v) => ({ ...v, slackWebhookUrl: e.target.value }))}
              placeholder="Webhook URL"
              className={fieldClass}
            />
          </GroupedRow>
          <GroupedRow>
            <div className="w-[4.5rem] shrink-0 text-[15px] text-muted-foreground">Hook</div>
            <Input
              id="rule-hook"
              type="url"
              value={value.genericWebhookUrl}
              onChange={(e) => setValue((v) => ({ ...v, genericWebhookUrl: e.target.value }))}
              placeholder="Webhook URL"
              className={fieldClass}
            />
          </GroupedRow>
        </SettingsGroup>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/40 px-6 py-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !compiled || overBudget}>
          {submitting ? "Saving…" : initial ? "Done" : "Add monitor"}
        </Button>
      </div>
    </form>
  );
}
