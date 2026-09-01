"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Filter, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { formatClock, formatCompact, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Match, Rule, UserLabel } from "@/lib/types";

function SignalVote({
  match,
  onVote,
}: {
  match: Match;
  onVote: (match: Match, label: UserLabel) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-col gap-1.5"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title="High signal — keep tweets like this"
        aria-label="Mark high signal"
        aria-pressed={match.userLabel === "high"}
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-[15px] font-medium transition-colors",
          match.userLabel === "high"
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground",
        )}
        onClick={() => onVote(match, "high")}
      >
        +
      </button>
      <button
        type="button"
        title="Low signal — hide tweets like this"
        aria-label="Mark low signal"
        aria-pressed={match.userLabel === "low"}
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-[15px] font-medium transition-colors",
          match.userLabel === "low"
            ? "bg-destructive/20 text-destructive"
            : "bg-white/[0.06] text-muted-foreground hover:bg-white/[0.1] hover:text-foreground",
        )}
        onClick={() => onVote(match, "low")}
      >
        −
      </button>
    </div>
  );
}

export function InboxView() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleId, setRuleId] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const load = async () => {
    try {
      const params = new URLSearchParams();
      if (ruleId !== "all") params.set("ruleId", ruleId);
      if (unreadOnly) params.set("unread", "1");
      const trimmed = query.trim();
      if (trimmed) {
        params.set("q", trimmed);
        params.set("limit", "500");
      }
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
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (typing) return;
      if (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        document.getElementById("inbox-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const params = new URLSearchParams();
        if (ruleId !== "all") params.set("ruleId", ruleId);
        if (unreadOnly) params.set("unread", "1");
        const trimmed = query.trim();
        if (trimmed) {
          params.set("q", trimmed);
          params.set("limit", "500");
        }
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
    const delay = query.trim() ? 200 : 0;
    const kickoff = setTimeout(() => {
      void run();
    }, delay);
    const timer = setInterval(() => {
      void run();
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [ruleId, unreadOnly, query]);

  const selected = useMemo(
    () => matches.find((m) => m.id === selectedId) ?? matches[0] ?? null,
    [matches, selectedId],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (typing || !selected) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        void vote(selected, "high");
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        void vote(selected, "low");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // vote is stable enough via selected + matches closure; we rebind when selected changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

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

  const vote = async (match: Match, label: UserLabel) => {
    const next = match.userLabel === label ? null : label;
    setMatches((prev) =>
      prev.map((m) => (m.tweetId === match.tweetId ? { ...m, userLabel: next } : m)),
    );
    const res = await fetch(`/api/matches/${match.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userLabel: next }),
    });
    if (!res.ok) {
      toast.error("Could not save signal label");
      load();
      return;
    }
    toast.success(
      next === "high" ? "Marked high signal" : next === "low" ? "Marked low signal" : "Cleared label",
    );
    load();
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

  const repoll = async () => {
    setPolling(true);
    try {
      const res = await fetch("/api/poll", { method: "POST" });
      if (!res.ok) throw new Error("Failed to request re-poll");
      const data = (await res.json()) as {
        demoMode: boolean;
        lastPollAt: string | null;
      };
      toast.success(
        data.demoMode
          ? "Injecting the next fixture…"
          : "Re-poll requested. Waiting for the next search…",
      );
      const before = data.lastPollAt;
      for (let i = 0; i < 10; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const statusRes = await fetch("/api/status", { cache: "no-store" });
        if (!statusRes.ok) continue;
        const status = (await statusRes.json()) as { poller: { lastPollAt: string | null } };
        if (status.poller.lastPollAt && status.poller.lastPollAt !== before) break;
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not re-poll");
    } finally {
      setPolling(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.022em]">Inbox</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Newest first. Use + / − to train the tape.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={repoll} disabled={polling}>
              <RefreshCw className={cn("size-3.5", polling && "animate-spin")} />
              {polling ? "Polling…" : "Re-poll"}
            </Button>
            <Button variant="ghost" size="sm" onClick={markAll}>
              Mark all read
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative min-w-0 flex-1 basis-48">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="inbox-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts, @handles, rules"
              className="h-9 rounded-full bg-white/[0.08] pl-9 text-[15px]"
              aria-label="Search inbox"
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox
              checked={unreadOnly}
              onCheckedChange={(value) => setUnreadOnly(value === true)}
            />
            Unread
          </label>
          <Select value={ruleId} onValueChange={(value) => setRuleId(String(value ?? "all"))}>
            <SelectTrigger className="min-w-36 rounded-full sm:min-w-44" size="sm">
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
        </div>
      </header>
      {error ? (
        <div className="m-5 rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
          {error}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-h-0 overflow-y-auto lg:border-r lg:border-white/[0.06]">
          {loading && matches.length === 0 ? (
            <EmptyState title="Loading" description="Fetching the latest matches." />
          ) : matches.length === 0 ? (
            <EmptyState
              title={query.trim() ? "No matches" : "Inbox Zero"}
              description={
                query.trim()
                  ? `Nothing found for “${query.trim()}”.`
                  : "New catalysts will appear here. Chatter without a desk signal is dropped."
              }
            />
          ) : (
            <ul>
              {matches.map((match) => {
                const active = selected?.id === match.id;
                return (
                  <li key={match.id}>
                    <div
                      className={cn(
                        "flex w-full items-start gap-1 border-b border-white/[0.05] pr-2 text-left transition-colors",
                        active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]",
                        match.userLabel === "low" && "opacity-50",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(match.id);
                          if (!match.read) mark(match.id, true);
                        }}
                        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
                      >
                        <span
                          className={cn(
                            "mt-2 size-2 shrink-0 rounded-full",
                            match.read ? "bg-transparent" : "bg-amber-400",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                              @{match.authorHandle}
                            </span>
                            <span className="truncate text-[13px] text-muted-foreground">{match.authorName}</span>
                            <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground">
                              {formatRelative(match.matchedAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-muted-foreground">
                            {match.text}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="h-5 rounded-full border-white/10 px-2 text-[11px] font-normal">
                              {match.ruleName}
                            </Badge>
                            {match.kol ? (
                              <Badge className="h-5 rounded-full bg-amber-400/15 px-2 text-[11px] font-semibold text-amber-200">
                                Node
                              </Badge>
                            ) : null}
                            {match.followersCount != null ? (
                              <span className="text-[12px] tabular-nums text-muted-foreground">
                                {formatCompact(match.followersCount)} fol
                              </span>
                            ) : null}
                            {match.likeCount != null ? (
                              <span className="text-[12px] tabular-nums text-muted-foreground">
                                {formatCompact(match.likeCount)} likes
                              </span>
                            ) : null}
                            {match.userLabel === "high" ? (
                              <span className="text-[12px] text-emerald-400">High</span>
                            ) : null}
                            {match.userLabel === "low" ? (
                              <span className="text-[12px] text-destructive">Low</span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                      <div className="pt-2.5">
                        <SignalVote match={match} onVote={vote} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="hidden min-h-0 overflow-y-auto px-8 py-8 lg:block">
          {selected ? (
            <article className="mx-auto max-w-xl space-y-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[17px] font-semibold tracking-[-0.02em]">@{selected.authorHandle}</div>
                  <div className="text-[15px] text-muted-foreground">{selected.authorName}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => mark(selected.id, !selected.read)}>
                    {selected.read ? "Mark unread" : "Mark read"}
                  </Button>
                  <a
                    href={selected.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }), "rounded-full")}
                  >
                    Open original
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-[17px] leading-[1.47] tracking-[-0.01em]">{selected.text}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
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
                <dt>Score</dt>
                <dd>{selected.signalScore != null ? selected.signalScore : "—"}</dd>
                <dt>Node</dt>
                <dd className="text-foreground">{selected.kol ? "Key Network Node" : "No"}</dd>
                <dt>Label</dt>
                <dd className="text-foreground">
                  {selected.userLabel === "high"
                    ? "High signal"
                    : selected.userLabel === "low"
                      ? "Low signal"
                      : "Unlabeled"}
                </dd>
                <dt>Author prior</dt>
                <dd>
                  {selected.authorPrior.high} high / {selected.authorPrior.low} low
                </dd>
                <dt>ID</dt>
                <dd className="tabular-nums">{selected.tweetId}</dd>
              </dl>
            </article>
          ) : (
            <EmptyState title="No selection" description="Choose a match from the list." />
          )}
        </div>
      </div>
    </div>
  );
}
