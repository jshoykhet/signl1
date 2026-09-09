"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Radar, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DietNode, DietReport } from "@/lib/diet";
import { formatCompact } from "@/lib/format";

type HandleSuggestion = {
  handle: string;
  source: "key" | "feed";
  followers: number | null;
};
import { cn } from "@/lib/utils";

const RECENT_KEY = "signl1:analyze-handles";

function MixBar({ report }: { report: DietReport }) {
  const total = Math.max(1, report.posted);
  const parts = [
    { label: "Originals", n: report.originals, className: "bg-amber-400" },
    { label: "Replies", n: report.replies, className: "bg-foreground/70" },
    { label: "Reposts", n: report.retweets, className: "bg-muted-foreground/40" },
  ];
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {parts.map((part) => (
          <div
            key={part.label}
            className={cn("h-full", part.className)}
            style={{ width: `${(part.n / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[13px] text-muted-foreground">
        {parts.map((part) => (
          <span key={part.label}>
            <span className="tabular-nums text-foreground">{part.n}</span> {part.label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

function NodeList({ title, empty, nodes }: { title: string; empty: string; nodes: DietNode[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Last 7 days of posts and mentions, not the full follow graph.</CardDescription>
      </CardHeader>
      <CardContent>
        {nodes.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {nodes.map((node) => (
              <li key={node.handle} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <a
                  href={`https://x.com/${node.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[15px] font-medium hover:underline"
                >
                  @{node.handle}
                </a>
                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                  {node.count}×
                  {node.followers != null ? ` · ${formatCompact(node.followers)} fol` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HourBars({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <div className="flex h-16 items-end gap-0.5">
      {hours.map((n, hour) => (
        <div
          key={hour}
          title={`${String(hour).padStart(2, "0")}:00 UTC · ${n}`}
          className="min-w-0 flex-1 rounded-t-sm bg-amber-400/80"
          style={{ height: `${Math.max(8, (n / max) * 100)}%`, opacity: n ? 1 : 0.2 }}
        />
      ))}
    </div>
  );
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeRecent(handle: string) {
  const next = [handle.toLowerCase(), ...readRecent().filter((item) => item !== handle.toLowerCase())].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function filterHandles(
  catalog: HandleSuggestion[],
  recent: string[],
  query: string,
): Array<HandleSuggestion & { recent?: boolean }> {
  const needle = query.replace(/^@/, "").trim().toLowerCase();
  const known = new Map(catalog.map((item) => [item.handle, item]));
  const scored: Array<HandleSuggestion & { recent?: boolean; rank: number }> = [];
  const seen = new Set<string>();
  const consider = (item: HandleSuggestion, recentHit: boolean) => {
    if (seen.has(item.handle)) return;
    if (needle && !item.handle.startsWith(needle) && !item.handle.includes(needle)) return;
    seen.add(item.handle);
    const prefix = needle && item.handle.startsWith(needle) ? 0 : 1;
    const recency = recentHit ? 0 : 1;
    const key = item.source === "key" ? 0 : 1;
    scored.push({ ...item, recent: recentHit, rank: prefix * 100 + recency * 10 + key });
  };
  for (const handle of recent) {
    consider(known.get(handle) ?? { handle, source: "feed", followers: null }, true);
  }
  for (const item of catalog) consider(item, false);
  return scored.sort((a, b) => a.rank - b.rank || a.handle.localeCompare(b.handle)).slice(0, 10);
}

export function AnalyzeView() {
  const [handle, setHandle] = useState("");
  const [report, setReport] = useState<DietReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<HandleSuggestion[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(readRecent());
    let cancelled = false;
    void fetch("/api/handles", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { handles: [] }))
      .then((data: { handles?: HandleSuggestion[] }) => {
        if (!cancelled) setCatalog(data.handles ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const suggestions = useMemo(() => filterHandles(catalog, recent, handle), [catalog, recent, handle]);

  const run = async (raw?: string) => {
    const next = (raw ?? handle).replace(/^@/, "").trim();
    if (!next) return;
    setHandle(next);
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyze?handle=${encodeURIComponent(next)}`, { cache: "no-store" });
      const data = (await res.json()) as DietReport & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not read that handle.");
      setReport(data);
      writeRecent(data.handle);
      setRecent(readRecent());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read that handle.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const pick = (value: string) => {
    setHandle(value);
    setOpen(false);
    void run(value);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Analyze"
          description="Type an X handle. Signl1 reads the last 7 days and tells you what they post, who they talk to, and how to grow reach."
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const chosen = open && suggestions[active] ? suggestions[active].handle : handle;
            void run(chosen);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div ref={boxRef} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={handle}
              onChange={(event) => {
                setHandle(event.target.value);
                setOpen(true);
                setActive(0);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (!open || suggestions.length === 0) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) => Math.min(suggestions.length - 1, index + 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => Math.max(0, index - 1));
                }
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="@handle"
              className="h-11 rounded-full bg-muted pl-9 text-[16px] sm:h-10 sm:text-[15px]"
              aria-label="X handle"
              aria-autocomplete="list"
              aria-expanded={open && suggestions.length > 0}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              role="combobox"
            />
            {open && suggestions.length > 0 ? (
              <ul
                role="listbox"
                className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-2xl border border-border bg-background py-1 shadow-lg"
              >
                {suggestions.map((item, index) => (
                  <li key={`${item.source}-${item.handle}`} role="option" aria-selected={index === active}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[15px]",
                        index === active ? "bg-muted" : "hover:bg-muted/70",
                      )}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => pick(item.handle)}
                    >
                      <span className="font-medium">@{item.handle}</span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">
                        {item.recent ? "Recent" : item.source === "key" ? "Key" : "Feed"}
                        {item.followers != null ? ` · ${formatCompact(item.followers)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Button type="submit" className="h-11 rounded-full sm:h-10" disabled={loading}>
            <Radar className="size-4" />
            {loading ? "Reading…" : "Analyze"}
          </Button>
        </form>
        {error ? (
          <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
        ) : null}

        {!report && !loading ? (
          <EmptyState
            title="No handle yet"
            description="Start typing — Key Accounts and authors from your feed show up. Demo mode uses a sample week if there is no X token."
          />
        ) : null}

        {loading && !report ? (
          <EmptyState title="Reading X" description="Two searches: what they posted, and who talked back." />
        ) : null}

        {report ? (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  @{report.handle}
                  {report.verified ? <Badge variant="outline">Verified</Badge> : null}
                  {report.demo ? (
                    <Badge className="bg-amber-400/20 text-amber-900 dark:text-amber-100">Sample week</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {report.name}
                  {report.followers != null ? ` · ${formatCompact(report.followers)} followers` : ""}
                  {` · ${report.posted} posts in ${report.windowDays} days`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <MixBar report={report} />
                <div className="grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
                  <div>
                    <div className="text-[12px] text-muted-foreground">Likes</div>
                    <div className="text-[18px] font-semibold tabular-nums">{formatCompact(report.likes)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-muted-foreground">Reposts</div>
                    <div className="text-[18px] font-semibold tabular-nums">{formatCompact(report.reposts)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-muted-foreground">Avg likes</div>
                    <div className="text-[18px] font-semibold tabular-nums">{report.avgLikes.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-muted-foreground">Impressions</div>
                    <div className="text-[18px] font-semibold tabular-nums">
                      {report.impressions != null ? formatCompact(report.impressions) : "—"}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[13px] text-muted-foreground">When they post (UTC)</div>
                  <HourBars hours={report.hours} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Information diet</CardTitle>
                <CardDescription>Tickers and tags in their own posts.</CardDescription>
              </CardHeader>
              <CardContent>
                {report.themes.length === 0 ? (
                  <p className="text-[14px] text-muted-foreground">No cashtags or hashtags in the window.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {report.themes.map((theme) => (
                      <Badge key={theme.token} variant="outline" className="rounded-full px-2.5 text-[13px]">
                        {theme.token}
                        <span className="ml-1 tabular-nums text-muted-foreground">{theme.count}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <NodeList
                title="Who they talk to"
                empty="They barely @ anyone this week."
                nodes={report.outbound}
              />
              <NodeList
                title="Who talks to them"
                empty="Almost no inbound mentions in the window."
                nodes={report.inbound}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>How to grow reach</CardTitle>
                <CardDescription>{report.note}</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {report.recommendations.map((rec, index) => (
                    <li key={rec.title} className="rounded-2xl bg-muted/60 px-4 py-3">
                      <div className="text-[15px] font-semibold tracking-[-0.015em]">
                        {index + 1}. {rec.title}
                      </div>
                      <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{rec.detail}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
