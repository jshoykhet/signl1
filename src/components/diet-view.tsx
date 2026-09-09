"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";

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

export function DietView() {
  const [handle, setHandle] = useState("");
  const [report, setReport] = useState<DietReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/diet?handle=${encodeURIComponent(handle)}`, { cache: "no-store" });
      const data = (await res.json()) as DietReport & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not read that handle.");
      setReport(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read that handle.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader
          title="Diet"
          description="Paste an X handle. Signl1 reads the last 7 days and tells you what they eat, who they talk to, and how to grow reach."
        />
        <form onSubmit={(event) => void run(event)} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@handle"
              className="h-11 rounded-full bg-muted pl-9 text-[16px] sm:h-10 sm:text-[15px]"
              aria-label="X handle"
              autoCapitalize="off"
              autoCorrect="off"
            />
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
            description="Try your own account, or a desk you follow. Demo mode uses a sample week so you can see the report without an X token."
          />
        ) : null}

        {loading && !report ? <EmptyState title="Reading X" description="Two searches: what they posted, and who talked back." /> : null}

        {report ? (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  @{report.handle}
                  {report.verified ? <Badge variant="outline">Verified</Badge> : null}
                  {report.demo ? <Badge className="bg-amber-400/20 text-amber-900 dark:text-amber-100">Sample week</Badge> : null}
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
