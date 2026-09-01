"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { RuleForm, type RuleFormValue } from "@/components/rule-form";
import { formatInterval, formatRelative } from "@/lib/format";
import { tokenizeSearch } from "@/lib/search";
import type { Rule } from "@/lib/types";

export function RulesView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/rules", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load rules");
      const data = (await res.json()) as { rules: Rule[] };
      setRules(data.rules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/rules", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load rules");
        const data = (await res.json()) as { rules: Rule[] };
        if (cancelled) return;
        setRules(data.rules);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load rules");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (value: RuleFormValue) => {
    setSubmitting(true);
    try {
      const payload = {
        name: value.name,
        enabled: value.enabled,
        queryInput: value.queryInput,
        accounts: value.accounts,
        pollIntervalMs: value.pollIntervalSec * 1000,
        slackWebhookUrl: value.slackWebhookUrl,
        genericWebhookUrl: value.genericWebhookUrl,
      };
      const res = await fetch(editing ? `/api/rules/${editing.id}` : "/api/rules", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "Rule updated" : "Rule created");
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (rule: Rule, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled } : r)));
    const res = await fetch(`/api/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.error("Could not update rule");
      load();
    }
  };

  const remove = async (rule: Rule) => {
    if (!confirm(`Delete “${rule.name}”? Matches for this rule are removed.`)) return;
    const res = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete rule");
      return;
    }
    toast.success("Rule deleted");
    load();
  };

  const tokens = tokenizeSearch(query);
  const visibleRules =
    tokens.length === 0
      ? rules
      : rules.filter((rule) => {
          const haystack = `${rule.name} ${rule.query} ${rule.queryInput} ${rule.accounts.join(" ")} ${rule.kind}`.toLowerCase();
          return tokens.every((token) => haystack.includes(token));
        });

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/80 px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-tight">Rules</h1>
          <p className="text-xs text-muted-foreground">
            Each enabled rule is polled on its own interval using X recent-search syntax.
          </p>
        </div>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rules or queries…"
            className="pl-8 font-mono text-[13px]"
            aria-label="Search rules"
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-3.5" />
          New rule
        </Button>
      </header>
      {error ? (
        <div className="m-5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">Loading rules…</div>
        ) : rules.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No rules yet. Create one to start scanning.</div>
        ) : visibleRules.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">No rules match “{query.trim()}”.</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-background text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr className="border-b border-border/80">
                <th className="px-5 py-2 font-medium">On</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Query</th>
                <th className="px-3 py-2 font-medium">Interval</th>
                <th className="px-3 py-2 font-medium">Last poll</th>
                <th className="px-5 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRules.map((rule) => (
                <tr key={rule.id} className="border-b border-border/60 align-top">
                  <td className="px-5 py-3">
                    <Switch
                      checked={rule.enabled}
                      disabled={rule.kind === "watchlist"}
                      onCheckedChange={(checked) => {
                        if (rule.kind === "watchlist") return;
                        toggle(rule, Boolean(checked));
                      }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{rule.name}</div>
                    {rule.kind === "watchlist" ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">Managed from Watchlist · cashtags</div>
                    ) : null}
                    {rule.lastError ? (
                      <div className="mt-1 max-w-56 truncate text-[11px] text-destructive">{rule.lastError}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <code className="block max-w-xl font-mono text-[11px] leading-relaxed break-all text-muted-foreground">
                      {rule.query}
                    </code>
                    {rule.accounts.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {rule.accounts.map((account) => (
                          <Badge key={account} variant="outline" className="h-4 rounded-sm px-1 font-mono text-[10px]">
                            @{account}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px]">{formatInterval(rule.pollIntervalMs)}</td>
                  <td className="px-3 py-3 text-[12px] text-muted-foreground">{formatRelative(rule.lastPolledAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {rule.kind === "watchlist" ? (
                        <Link href="/watchlist" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                          Edit list
                        </Link>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEditing(rule);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => remove(rule)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(Boolean(next));
          if (!next) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rule" : "New rule"}</DialogTitle>
            <DialogDescription>
              Queries use official X recent-search operators. The poller sends the compiled string as-is.
            </DialogDescription>
          </DialogHeader>
          <RuleForm
            key={editing?.id ?? "new"}
            initial={editing}
            submitting={submitting}
            onSubmit={save}
            onCancel={() => {
              setOpen(false);
              setEditing(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
