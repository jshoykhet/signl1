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
      <header className="flex flex-wrap items-center gap-3 border-b border-border/80 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold tracking-tight">Watchlist</h1>
          <p className="text-xs text-muted-foreground">
            Names you want FinTwit alerts on. Paste tickers as-is — the backend adds the $ cashtag and polls them as
            a dedicated rule.
          </p>
        </div>
        {watchlist ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={watchlist.enabled}
              onCheckedChange={(checked) => void put({ enabled: Boolean(checked) })}
              disabled={saving}
            />
            {watchlist.enabled ? "Screening on" : "Paused"}
          </label>
        ) : null}
      </header>
      {error ? (
        <div className="m-5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ticker-draft">Add tickers</Label>
            <Textarea
              id="ticker-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void addDraft();
                }
              }}
              placeholder={"NVDA, AAPL, TSLA\nSPY QQQ"}
              className="min-h-24 font-mono text-xs"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Comma, space, or newline separated. $ is optional. Ctrl/Cmd+Enter to add.
              </p>
              <Button size="sm" onClick={() => void addDraft()} disabled={saving || !draft.trim()}>
                <Plus className="size-3.5" />
                Add to list
              </Button>
            </div>
          </div>
          {suggestions.length ? (
            <div>
              <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Suggestions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((symbol) => (
                  <Button
                    key={symbol}
                    type="button"
                    variant="outline"
                    size="xs"
                    className="font-mono"
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
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter list…"
                className="pl-8 font-mono text-[13px]"
                aria-label="Filter watchlist"
              />
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {watchlist ? `${watchlist.tickers.length} names` : ""}
            </div>
          </div>
          {loading && !watchlist ? (
            <p className="text-sm text-muted-foreground">Loading watchlist…</p>
          ) : !watchlist || watchlist.tickers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No names yet. Add NVDA or paste a column of tickers from a spreadsheet.
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickers match “{filter.trim()}”.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {visible.map((symbol) => (
                <li key={symbol}>
                  <Badge variant="outline" className="h-7 gap-1 rounded-md px-2 font-mono text-[12px]">
                    ${symbol}
                    <button
                      type="button"
                      className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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
        <section className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-border/80">
            <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Compiled cashtag rule
            </div>
            <div className="space-y-3 px-4 py-3">
              {watchlist?.compiledQueries.length ? (
                watchlist.compiledQueries.map((query, index) => (
                  <div key={query}>
                    {watchlist.compiledQueries.length > 1 ? (
                      <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                        Query {index + 1}
                      </div>
                    ) : null}
                    <code className="block font-mono text-[11px] leading-relaxed break-all text-foreground">{query}</code>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Add at least one ticker and Signal1 will poll{" "}
                  <code className="font-mono text-[11px]">($NVDA OR $AAPL) lang:en -is:retweet</code>.
                </p>
              )}
              {watchlist && watchlist.compiledQueries.length > 1 ? (
                <p className="text-[11px] text-muted-foreground">
                  Split across {watchlist.compiledQueries.length} rules so each query stays under X recent-search
                  length limits.
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="watchlist-interval">Poll interval (seconds)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="watchlist-interval"
                type="number"
                min={MIN_POLL_INTERVAL_MS / 1000}
                step={1}
                value={intervalSec}
                onChange={(event) => setIntervalSec(Number(event.target.value))}
                className="max-w-32"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || !watchlist}
                onClick={() => void put({ pollIntervalMs: intervalSec * 1000 }, "Interval saved")}
              >
                Save interval
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Default {formatInterval(DEFAULT_POLL_INTERVAL_MS)}. Live mode packs the watchlist with your other rules
              when they fit in one query, and never polls faster than 60s.
            </p>
          </div>
          {watchlist?.rules[0] ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
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
  );
}
