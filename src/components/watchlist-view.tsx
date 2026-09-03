"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { PageHeader } from "@/components/page-header";
import { DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS } from "@/lib/config";
import { formatInterval, formatRelative } from "@/lib/format";
import { WATCHLIST_SUGGESTIONS } from "@/lib/tickers";
import type { WatchlistSnapshot } from "@/lib/types";

export function WatchlistView() {
  const [watchlist, setWatchlist] = useState<WatchlistSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_POLL_INTERVAL_MS / 1000);

  const load = async () => {
    try {
      const res = await fetch("/api/watchlist", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load watchlist");
      const data = (await res.json()) as { watchlist: WatchlistSnapshot };
      setWatchlist(data.watchlist);
      setIntervalSec(Math.round(data.watchlist.pollIntervalMs / 1000));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const put = async (body: Record<string, unknown>, success?: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { watchlist?: WatchlistSnapshot; skipped?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (data.watchlist) {
        setWatchlist(data.watchlist);
        setIntervalSec(Math.round(data.watchlist.pollIntervalMs / 1000));
      }
      const skipped = data.skipped ?? [];
      if (skipped.length) {
        toast.warning(`Skipped invalid tickers: ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""}`);
      }
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addDraft = async () => {
    const value = draft.trim();
    if (!value) return;
    await put({ add: value }, "Watchlist updated");
    setDraft("");
  };

  const visible = useMemo(() => {
    const tickers = watchlist?.tickers ?? [];
    const q = filter.trim().toUpperCase().replace(/^\$/, "");
    if (!q) return tickers;
    return tickers.filter((symbol) => symbol.includes(q));
  }, [watchlist, filter]);

  const suggestions = WATCHLIST_SUGGESTIONS.filter(
    (symbol) => !(watchlist?.tickers ?? []).includes(symbol),
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <PageHeader
          title="Watchlist"
          description="Names you want FinTwit alerts on. Paste tickers as-is — the backend adds the $ cashtag."
        />
        {error ? (
          <div className="mt-6 rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
        ) : null}
        <div className="mt-8 grid flex-1 gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="space-y-6">
            {watchlist ? (
              <SettingsGroup>
                <GroupedRow>
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-medium tracking-[-0.01em]">
                      {watchlist.enabled ? "Screening on" : "Screening off"}
                    </div>
                    <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                      {watchlist.enabled
                        ? "Cashtag alerts are polling. Flip this off to stop X searches without deleting names."
                        : "The ticker list is kept, but Watchlist is not included in live polls."}
                    </div>
                  </div>
                  <Switch
                    checked={watchlist.enabled}
                    aria-label="Turn watchlist screening on or off"
                    onCheckedChange={(checked) =>
                      void put({ enabled: Boolean(checked) }, checked ? "Watchlist on" : "Watchlist off")
                    }
                    disabled={saving}
                  />
                </GroupedRow>
              </SettingsGroup>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="ticker-draft" className="px-1 text-[13px] font-normal text-muted-foreground">
                Add tickers
              </Label>
              <Textarea
                id="ticker-draft"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  void addDraft();
                }}
                placeholder={"NVDA, AAPL, TSLA\nSPY QQQ"}
                className="min-h-24 rounded-2xl font-mono text-[13px]"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-[13px] text-muted-foreground">
                  Comma, space, or newline. Enter adds; Shift+Enter for a new line.
                </p>
                <Button size="sm" onClick={() => void addDraft()} disabled={saving || !draft.trim()}>
                  <Plus className="size-3.5" />
                  Add to list
                </Button>
              </div>
            </div>
            {suggestions.length ? (
              <div>
                <div className="mb-2 px-1 text-[13px] text-muted-foreground">Suggestions</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((symbol) => (
                    <Button
                      key={symbol}
                      type="button"
                      variant="outline"
                      size="xs"
                      className="rounded-full font-mono"
                      disabled={saving}
                      onClick={() => void put({ add: symbol })}
                    >
                      ${symbol}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter list"
                  className="rounded-full pl-9"
                  aria-label="Filter watchlist"
                />
              </div>
              <div className="text-[13px] tabular-nums text-muted-foreground">
                {watchlist ? `${watchlist.tickers.length} names` : ""}
              </div>
            </div>
            {loading && !watchlist ? (
              <p className="text-[15px] text-muted-foreground">Loading watchlist…</p>
            ) : !watchlist || watchlist.tickers.length === 0 ? (
              <EmptyState
                title="No names yet"
                description="Add NVDA or paste a column of tickers from a spreadsheet."
                className="rounded-2xl bg-card py-12 shadow-sm ring-1 ring-border"
              />
            ) : visible.length === 0 ? (
              <p className="px-1 text-[15px] text-muted-foreground">No tickers match “{filter.trim()}”.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {visible.map((symbol) => (
                  <li key={symbol}>
                    <Badge variant="outline" className="h-8 gap-1 rounded-full border-border px-2.5 font-mono text-[13px]">
                      ${symbol}
                      <button
                        type="button"
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Remove ${symbol}`}
                        disabled={saving}
                        onClick={() => void put({ remove: symbol })}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-6">
            <SettingsGroup title="Compiled cashtag rule">
              <div className="space-y-3 px-4 py-3.5">
                {watchlist?.compiledQueries.length ? (
                  watchlist.compiledQueries.map((query, index) => (
                    <div key={query}>
                      {watchlist.compiledQueries.length > 1 ? (
                        <div className="mb-1 text-[13px] text-muted-foreground">Query {index + 1}</div>
                      ) : null}
                      <code className="block font-mono text-[13px] leading-relaxed break-all text-foreground">{query}</code>
                    </div>
                  ))
                ) : (
                  <p className="text-[15px] text-muted-foreground">
                    Add at least one ticker and Signl1 will poll{" "}
                    <code className="font-mono text-[13px]">($NVDA OR $AAPL) lang:en -is:retweet</code>.
                  </p>
                )}
                {watchlist && watchlist.compiledQueries.length > 1 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Split across {watchlist.compiledQueries.length} rules so each query stays under X recent-search
                    length limits.
                  </p>
                ) : null}
                {watchlist && !watchlist.enabled ? (
                  <p className="text-[13px] text-amber-700 dark:text-amber-300">
                    Screening is off. This query is not sent to X until you turn it back on.
                  </p>
                ) : null}
              </div>
            </SettingsGroup>
            <SettingsGroup title="Poll interval">
              <GroupedRow className="flex-wrap">
                <Input
                  id="watchlist-interval"
                  type="number"
                  min={MIN_POLL_INTERVAL_MS / 1000}
                  step={1}
                  value={intervalSec}
                  onChange={(event) => setIntervalSec(Number(event.target.value))}
                  className="max-w-28"
                  aria-label="Poll interval in seconds"
                />
                <span className="text-[13px] text-muted-foreground">seconds</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={saving || !watchlist}
                  onClick={() => void put({ pollIntervalMs: intervalSec * 1000 }, "Interval saved")}
                >
                  Save
                </Button>
              </GroupedRow>
            </SettingsGroup>
            <p className="px-1 text-[13px] leading-5 text-muted-foreground">
              Default {formatInterval(DEFAULT_POLL_INTERVAL_MS)}. Live mode packs the watchlist with your other rules
              when they fit in one query, and never polls faster than 60s.
            </p>
            {watchlist?.rules[0] ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-1 text-[13px] text-muted-foreground">
                <dt>Last poll</dt>
                <dd>{formatRelative(watchlist.rules[0].lastPolledAt)}</dd>
                <dt>Last error</dt>
                <dd className={watchlist.rules[0].lastError ? "text-destructive" : undefined}>
                  {watchlist.rules[0].lastError || "None"}
                </dd>
              </dl>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
