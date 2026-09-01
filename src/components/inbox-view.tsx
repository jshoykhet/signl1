"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Filter } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatClock, formatCompact, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Match, Rule } from "@/lib/types";

export function InboxView() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleId, setRuleId] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (ruleId !== "all") params.set("ruleId", ruleId);
      if (unreadOnly) params.set("unread", "1");
      const [matchRes, ruleRes] = await Promise.all([
        fetch(`/api/matches?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/rules", { cache: "no-store" }),
      ]);
      if (!matchRes.ok) throw new Error("Failed to load inbox");
      const matchJson = (await matchRes.json()) as { matches: Match[] };
      const ruleJson = ruleRes.ok ? ((await ruleRes.json()) as { rules: Rule[] }) : { rules: [] };
      setMatches(matchJson.matches);
      setRules(ruleJson.rules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const params = new URLSearchParams();
        if (ruleId !== "all") params.set("ruleId", ruleId);
        if (unreadOnly) params.set("unread", "1");
        const [matchRes, ruleRes] = await Promise.all([
          fetch(`/api/matches?${params.toString()}`, { cache: "no-store" }),
          fetch("/api/rules", { cache: "no-store" }),
        ]);
        if (!matchRes.ok) throw new Error("Failed to load inbox");
        const matchJson = (await matchRes.json()) as { matches: Match[] };
        const ruleJson = ruleRes.ok ? ((await ruleRes.json()) as { rules: Rule[] }) : { rules: [] };
        if (cancelled) return;
        setMatches(matchJson.matches);
        setRules(ruleJson.rules);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load inbox");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    const timer = setInterval(() => {
      void run();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ruleId, unreadOnly]);

  const selected = useMemo(
    () => matches.find((m) => m.id === selectedId) ?? matches[0] ?? null,
    [matches, selectedId],
  );

  const mark = async (id: string, read: boolean) => {
    const res = await fetch(`/api/matches/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ read }),
    });
    if (!res.ok) {
      toast.error("Could not update read state");
      return;
    }
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, read } : m)));
  };

  const markAll = async () => {
    const res = await fetch("/api/matches/read-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleId: ruleId === "all" ? undefined : ruleId }),
    });
    if (!res.ok) {
      toast.error("Could not mark all read");
      return;
    }
    toast.success("Marked read");
    load();
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border/80 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold tracking-tight">Inbox</h1>
          <p className="text-xs text-muted-foreground">Newest matches first. Low-signal accounts are filtered out.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={unreadOnly}
              onCheckedChange={(value) => setUnreadOnly(value === true)}
            />
            Unread only
          </label>
          <Select value={ruleId} onValueChange={(value) => setRuleId(String(value ?? "all"))}>
            <SelectTrigger className="min-w-44" size="sm">
              <Filter className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rules</SelectItem>
              {rules.map((rule) => (
                <SelectItem key={rule.id} value={rule.id}>
                  {rule.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={markAll}>
            Mark all read
          </Button>
        </div>
      </header>
      {error ? (
        <div className="m-5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-h-0 overflow-y-auto border-r border-border/80">
          {loading && matches.length === 0 ? (
            <div className="px-5 py-10 text-sm text-muted-foreground">Loading matches…</div>
          ) : matches.length === 0 ? (
            <div className="px-5 py-10 text-sm text-muted-foreground">
              No quality matches yet. Noise below 50 followers or 5 likes is dropped. Wait for the next live poll.
            </div>
          ) : (
            <ul>
              {matches.map((match) => {
                const active = selected?.id === match.id;
                return (
                  <li key={match.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(match.id);
                        if (!match.read) mark(match.id, true);
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-border/60 px-4 py-2.5 text-left transition-colors",
                        active ? "bg-muted/70" : "hover:bg-muted/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          match.read ? "bg-transparent" : "bg-amber-400",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-[12px] text-foreground">@{match.authorHandle}</span>
                          <span className="truncate text-[11px] text-muted-foreground">{match.authorName}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                            {formatRelative(match.matchedAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-foreground/90">{match.text}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="h-4 rounded-sm px-1.5 text-[10px] font-normal">
                            {match.ruleName}
                          </Badge>
                          {match.followersCount != null ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {formatCompact(match.followersCount)} fol
                            </span>
                          ) : null}
                          {match.likeCount != null ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {formatCompact(match.likeCount)} likes
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="hidden min-h-0 overflow-y-auto p-5 lg:block">
          {selected ? (
            <article className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm">@{selected.authorHandle}</div>
                  <div className="text-xs text-muted-foreground">{selected.authorName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => mark(selected.id, !selected.read)}>
                    {selected.read ? "Mark unread" : "Mark read"}
                  </Button>
                  <a
                    href={selected.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm" }))}
                  >
                    Open original
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{selected.text}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <dt>Rule</dt>
                <dd className="text-foreground">{selected.ruleName}</dd>
                <dt>Tweet</dt>
                <dd>{formatClock(selected.tweetCreatedAt)}</dd>
                <dt>Matched</dt>
                <dd>{formatClock(selected.matchedAt)}</dd>
                <dt>Followers</dt>
                <dd>{formatCompact(selected.followersCount)}</dd>
                <dt>Likes</dt>
                <dd>{formatCompact(selected.likeCount)}</dd>
                <dt>Signal</dt>
                <dd>{selected.signalScore != null ? selected.signalScore : "—"}</dd>
                <dt>ID</dt>
                <dd>{selected.tweetId}</dd>
              </dl>
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">Select a match to inspect it.</p>
          )}
        </div>
      </div>
    </div>
  );
}
