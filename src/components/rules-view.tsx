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
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
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

  const toggleWatchlist = async (enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.kind === "watchlist" ? { ...r, enabled } : r)));
    const res = await fetch("/api/watchlist", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.error("Could not update watchlist");
      load();
      return;
    }
    toast.success(enabled ? "Watchlist on" : "Watchlist off");
  };

  const toggle = async (rule: Rule, enabled: boolean) => {
    if (rule.kind === "watchlist") {
      await toggleWatchlist(enabled);
      return;
    }
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
      <div className="border-b border-white/[0.06] px-5 py-6">
        <PageHeader
          title="Rules"
          description="Each enabled rule is polled on its own interval using X recent-search syntax."
          actions={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="size-4" />
              New rule
            </Button>
          }
        />
        <div className="relative mt-5 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rules or queries"
            className="rounded-full pl-9"
            aria-label="Search rules"
          />
        </div>
      </div>
      {error ? (
        <div className="m-5 rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
      ) : null}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <EmptyState title="Loading" description="Fetching your rules." />
        ) : rules.length === 0 ? (
          <EmptyState title="No rules yet" description="Create one to start scanning recent search." />
        ) : visibleRules.length === 0 ? (
          <EmptyState title="No matches" description={`Nothing found for “${query.trim()}”.`} />
        ) : (
          <table className="w-full text-left text-[15px]">
            <thead className="sticky top-0 bg-background/90 text-[13px] text-muted-foreground backdrop-blur">
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-2.5 font-normal">On</th>
                <th className="px-3 py-2.5 font-normal">Name</th>
                <th className="px-3 py-2.5 font-normal">Query</th>
                <th className="px-3 py-2.5 font-normal">Interval</th>
                <th className="px-3 py-2.5 font-normal">Last poll</th>
                <th className="px-5 py-2.5 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRules.map((rule) => (
                <tr key={rule.id} className="border-b border-white/[0.05] align-top">
                  <td className="px-5 py-3.5">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(checked) => toggle(rule, Boolean(checked))}
                    />
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="font-medium tracking-[-0.01em]">{rule.name}</div>
                    {rule.kind === "watchlist" ? (
                      <div className="mt-1 text-[13px] text-muted-foreground">Managed from Watchlist · cashtags</div>
                    ) : null}
                    {rule.lastError ? (
                      <div className="mt-1 max-w-56 truncate text-[13px] text-destructive">{rule.lastError}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3.5">
                    <code className="block max-w-xl font-mono text-[13px] leading-relaxed break-all text-muted-foreground">
                      {rule.query}
                    </code>
                    {rule.accounts.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rule.accounts.map((account) => (
                          <Badge key={account} variant="outline" className="h-5 rounded-full px-2 font-mono text-[11px]">
                            @{account}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3.5 text-[13px] tabular-nums">{formatInterval(rule.pollIntervalMs)}</td>
                  <td className="px-3 py-3.5 text-[13px] text-muted-foreground">{formatRelative(rule.lastPolledAt)}</td>
                  <td className="px-5 py-3.5">
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
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-2xl" showCloseButton>
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
