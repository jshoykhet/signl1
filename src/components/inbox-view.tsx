"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Filter, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { MatchDetail } from "@/components/match-detail";
import { OpenOnX } from "@/components/open-on-x";
import { formatCompact, formatRelative } from "@/lib/format";
import { FEED_POLL_MS } from "@/lib/config";
import { cadenceLabel } from "@/lib/desk-settings";
import { FocusControl } from "@/components/focus-control";
import { parseDeskMode, type DeskMode } from "@/lib/desk-mode";
import { cn } from "@/lib/utils";
import type { Match, Rule, StatusSnapshot, UserLabel } from "@/lib/types";
import type { WhatsAppPublicStatus } from "@/lib/whatsapp-status";

const PAGE_SIZE = 40;

type MatchesPage = {
  matches: Match[];
  nextCursor: string | null;
  hasMore: boolean;
};

function mergeHead(prev: Match[], incoming: Match[]): Match[] {
  const seen = new Set(prev.map((match) => match.id));
  const fresh = incoming.filter((match) => !seen.has(match.id));
  const incomingById = new Map(incoming.map((match) => [match.id, match]));
  const rest = prev.map((match) => incomingById.get(match.id) ?? match);
  return [...fresh, ...rest];
}

function appendPage(prev: Match[], incoming: Match[]): Match[] {
  const seen = new Set(prev.map((match) => match.id));
  return [...prev, ...incoming.filter((match) => !seen.has(match.id))];
}

function SignalVote({
  match,
  onVote,
}: {
  match: Match;
  onVote: (match: Match, label: UserLabel) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-col gap-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title="Keep posts like this"
        aria-label="Mark high signal"
        aria-pressed={match.userLabel === "high"}
        className={cn(
          "flex size-11 items-center justify-center rounded-full text-[18px] font-medium transition-colors sm:size-7 sm:text-[15px]",
          match.userLabel === "high"
            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        )}
        onClick={() => onVote(match, "high")}
      >
        +
      </button>
      <button
        type="button"
        title="Hide posts like this"
        aria-label="Mark low signal"
        aria-pressed={match.userLabel === "low"}
        className={cn(
          "flex size-11 items-center justify-center rounded-full text-[18px] font-medium transition-colors sm:size-7 sm:text-[15px]",
          match.userLabel === "low"
            ? "bg-destructive/20 text-destructive"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
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
  const [cadenceMinutes, setCadenceMinutes] = useState<number | null>(null);
  const [pollerError, setPollerError] = useState<string | null>(null);
  const [deskMode, setDeskMode] = useState<DeskMode>("markets");
  const [modeBusy, setModeBusy] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [waStatus, setWaStatus] = useState<WhatsAppPublicStatus["status"] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const nextCursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const filtersRef = useRef({ ruleId, unreadOnly, query });
  filtersRef.current = { ruleId, unreadOnly, query };

  const applyStatus = (statusJson: Partial<StatusSnapshot>) => {
    if (typeof statusJson.cadenceMinutes === "number") setCadenceMinutes(statusJson.cadenceMinutes);
    setPollerError(statusJson.poller?.lastError?.trim() || null);
    if (statusJson.deskFilters?.deskMode) setDeskMode(parseDeskMode(statusJson.deskFilters.deskMode));
  };

  const buildParams = (cursor?: string | null) => {
    const { ruleId: rid, unreadOnly: unread, query: q } = filtersRef.current;
    const params = new URLSearchParams();
    if (rid !== "all") params.set("ruleId", rid);
    if (unread) params.set("unread", "1");
    const trimmed = q.trim();
    if (trimmed) params.set("q", trimmed);
    params.set("limit", String(PAGE_SIZE));
    if (cursor) params.set("cursor", cursor);
    return params;
  };

  const applyPage = (page: MatchesPage, mode: "reset" | "head" | "append") => {
    if (mode === "reset") {
      setMatches(page.matches);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      return;
    }
    if (mode === "append") {
      setMatches((prev) => appendPage(prev, page.matches));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      return;
    }
    setMatches((prev) => {
      const merged = mergeHead(prev, page.matches);
      return filtersRef.current.unreadOnly ? merged.filter((match) => !match.read) : merged;
    });
  };

  const load = async () => {
    try {
      const [matchRes, ruleRes, statusRes] = await Promise.all([
        fetch(`/api/matches?${buildParams().toString()}`, { cache: "no-store" }),
        fetch("/api/rules", { cache: "no-store" }),
        fetch("/api/status", { cache: "no-store" }),
      ]);
      if (!matchRes.ok) throw new Error("Failed to load feed");
      const matchJson = (await matchRes.json()) as MatchesPage;
      const ruleJson = ruleRes.ok ? ((await ruleRes.json()) as { rules: Rule[] }) : { rules: [] };
      const statusJson = (
        statusRes.ok ? await statusRes.json() : {}
      ) as Partial<StatusSnapshot>;
      applyPage(matchJson, "reset");
      setRules(ruleJson.rules);
      applyStatus(statusJson);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !nextCursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const cursor = nextCursorRef.current;
    try {
      const res = await fetch(`/api/matches?${buildParams(cursor).toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load more");
      applyPage((await res.json()) as MatchesPage, "append");
    } catch {
      /* keep pages already on screen */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const saveMode = async (id: DeskMode) => {
    setModeBusy(true);
    try {
      const res = await fetch("/api/desk", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deskMode: id }),
      });
      if (!res.ok) throw new Error("Couldn't switch Focus.");
      const data = (await res.json()) as { deskMode?: DeskMode };
      const next = parseDeskMode(data.deskMode ?? id);
      setDeskMode(next);
      setRuleId("all");
      window.dispatchEvent(new CustomEvent("signl1:desk-mode", { detail: next }));
      const toasts: Record<DeskMode, string> = {
        markets: "Now watching markets. Next search follows Key Leaders and Watchlist.",
        both: "Now watching markets and venture.",
        venture: "Now watching venture. Next search follows Tech Leaders, funding, and launches.",
      };
      toast.success(toasts[next]);
      void fetch("/api/poll", { method: "POST" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch Focus.");
    } finally {
      setModeBusy(false);
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
      if (event.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/whatsapp", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as WhatsAppPublicStatus;
        if (!cancelled) setWaStatus(data.status);
      } catch {
        /* settings page owns errors */
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailOpen]);

  useEffect(() => {
    let cancelled = false;
    const run = async (reset: boolean) => {
      try {
        const [matchRes, ruleRes, statusRes] = await Promise.all([
          fetch(`/api/matches?${buildParams().toString()}`, { cache: "no-store" }),
          fetch("/api/rules", { cache: "no-store" }),
          fetch("/api/status", { cache: "no-store" }),
        ]);
        if (!matchRes.ok) throw new Error("Failed to load feed");
        const matchJson = (await matchRes.json()) as MatchesPage;
        const ruleJson = ruleRes.ok ? ((await ruleRes.json()) as { rules: Rule[] }) : { rules: [] };
        const statusJson = (
          statusRes.ok ? await statusRes.json() : {}
        ) as Partial<StatusSnapshot>;
        if (cancelled) return;
        applyPage(matchJson, reset ? "reset" : "head");
        setRules(ruleJson.rules);
        applyStatus(statusJson);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load feed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const delay = query.trim() ? 200 : 0;
    const kickoff = setTimeout(() => {
      void run(true);
    }, delay);
    const timer = setInterval(() => {
      void run(false);
    }, FEED_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [ruleId, unreadOnly, query]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
    hasMoreRef.current = hasMore;
  }, [nextCursor, hasMore]);

  useEffect(() => {
    const root = listRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: "240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading, matches.length]);

  const selected = useMemo(
    () => matches.find((m) => m.id === selectedId) ?? matches[0] ?? null,
    [matches, selectedId],
  );

  const focusRules = useMemo(() => {
    if (deskMode === "both") return rules;
    if (deskMode === "venture") return rules.filter((rule) => rule.mode === "vc");
    return rules.filter((rule) => rule.mode === "markets");
  }, [rules, deskMode]);

  useEffect(() => {
    if (ruleId !== "all" && !focusRules.some((rule) => rule.id === ruleId)) {
      setRuleId("all");
    }
  }, [focusRules, ruleId]);

  useEffect(() => {
    const onMode = () => {
      void load();
    };
    window.addEventListener("signl1:desk-mode", onMode);
    return () => window.removeEventListener("signl1:desk-mode", onMode);
    // Reload when Settings changes Focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId, unreadOnly, query]);

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

  const waNeedsLink = waStatus != null && waStatus !== "connected";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.022em]">Feed</h1>
            <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground sm:text-[13px]">
              Tap a post to read it, or open it on X.
              {cadenceMinutes ? (
                <span className="hidden sm:inline">
                  {` Checks ${cadenceLabel(cadenceMinutes).replace(/^Every /, "every ")}.`}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
            <Button variant="ghost" className="h-11 min-h-11 flex-1 sm:h-8 sm:min-h-8 sm:flex-none" size="sm" onClick={repoll} disabled={polling}>
              <RefreshCw className={cn("size-3.5", polling && "animate-spin")} />
              {polling ? "Polling…" : "Re-poll"}
            </Button>
            <Button variant="ghost" className="h-11 min-h-11 flex-1 sm:h-8 sm:min-h-8 sm:flex-none" size="sm" onClick={markAll}>
              Mark all read
            </Button>
          </div>
        </div>
        <FocusControl value={deskMode} disabled={modeBusy} compact onChange={(id) => void saveMode(id)} />
        {waNeedsLink ? (
          <Link
            href="/whatsapp"
            className="rounded-2xl bg-amber-400/18 px-4 py-3.5 text-[15px] leading-snug text-amber-950 dark:text-amber-50 lg:hidden"
          >
            <span className="font-semibold">Link WhatsApp</span>
            <span className="mt-0.5 block text-[14px] text-amber-900/80 dark:text-amber-100/75">
              {waStatus === "pairing" || waStatus === "qr" || waStatus === "connecting"
                ? "Finish pairing so you can search X from this phone."
                : "Tap to pair WhatsApp, then text a ticker or search."}
            </span>
          </Link>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="inbox-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search posts, @handles, rules"
              className="h-11 rounded-full bg-muted pl-9 text-[16px] sm:h-9 sm:text-[15px]"
              aria-label="Search feed"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 items-center gap-2.5 text-[15px] text-muted-foreground sm:min-h-0 sm:text-[13px]">
              <Checkbox
                checked={unreadOnly}
                onCheckedChange={(value) => setUnreadOnly(value === true)}
              />
              Unread
            </label>
            <Select value={ruleId} onValueChange={(value) => setRuleId(String(value ?? "all"))}>
              <SelectTrigger className="h-11 min-h-11 min-w-0 flex-1 rounded-full sm:h-8 sm:min-h-8 sm:min-w-44" size="sm">
                <Filter className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {focusRules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>
      {error ? (
        <div className="m-5 rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
          {error}
        </div>
      ) : null}
      {pollerError ? (
        <div className="mx-5 mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">
          Signl1 can&apos;t reach X right now. {pollerError}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div ref={listRef} className="min-h-0 overflow-y-auto lg:border-r lg:border-border">
          {loading && matches.length === 0 ? (
            <EmptyState title="Loading" description="Just a moment." />
          ) : matches.length === 0 ? (
            <EmptyState
              title={query.trim() ? "No matches" : "Nothing yet"}
              description={
                query.trim()
                  ? `Nothing found for “${query.trim()}”.`
                  : "Useful posts will show up here. Chatter and dunks stay out."
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
                        "border-b border-border text-left transition-colors",
                        active ? "bg-muted" : "hover:bg-muted/60",
                        match.userLabel === "low" && "opacity-50",
                      )}
                    >
                      <div className="flex w-full items-start gap-1 pr-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(match.id);
                            setDetailOpen(true);
                            if (!match.read) mark(match.id, true);
                          }}
                          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-4 text-left sm:py-3"
                        >
                          <span
                            className={cn(
                              "mt-2.5 size-2.5 shrink-0 rounded-full sm:mt-2 sm:size-2",
                              match.read ? "bg-transparent" : "bg-amber-400",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-[17px] font-semibold tracking-[-0.01em] text-foreground sm:text-[15px]">
                                @{match.authorHandle}
                              </span>
                              <span className="min-w-0 text-[14px] text-muted-foreground sm:truncate sm:text-[13px]">
                                {match.authorName}
                              </span>
                              <span className="w-full text-[13px] tabular-nums text-muted-foreground sm:ml-auto sm:w-auto sm:text-[12px]">
                                {formatRelative(match.matchedAt)}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-4 text-[16px] leading-[1.45] text-foreground/90 sm:mt-0.5 sm:line-clamp-2 sm:text-[15px] sm:leading-snug sm:text-muted-foreground">
                              {match.text}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-1.5">
                              <Badge variant="outline" className="h-6 rounded-full border-border px-2 text-[12px] font-normal sm:h-5 sm:text-[11px]">
                                {match.ruleName}
                              </Badge>
                              {match.kol ? (
                                <Badge className="h-6 rounded-full bg-amber-400/20 px-2 text-[12px] font-semibold text-amber-800 sm:h-5 sm:text-[11px] dark:bg-amber-400/15 dark:text-amber-200">
                                  Key
                                </Badge>
                              ) : null}
                              {match.followersCount != null ? (
                                <span className="text-[13px] tabular-nums text-muted-foreground sm:text-[12px]">
                                  {formatCompact(match.followersCount)} fol
                                </span>
                              ) : null}
                              {match.likeCount != null ? (
                                <span className="text-[13px] tabular-nums text-muted-foreground sm:text-[12px]">
                                  {formatCompact(match.likeCount)} likes
                                </span>
                              ) : null}
                              {match.userLabel === "high" ? (
                                <span className="text-[13px] text-emerald-700 sm:text-[12px] dark:text-emerald-400">High</span>
                              ) : null}
                              {match.userLabel === "low" ? (
                                <span className="text-[13px] text-destructive sm:text-[12px]">Low</span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                        <div className="pt-3 sm:pt-2.5">
                          <SignalVote match={match} onVote={vote} />
                        </div>
                      </div>
                      <div className="flex gap-2 px-4 pb-3 pl-[2.15rem] lg:hidden">
                        <OpenOnX href={match.permalink} size="row" />
                      </div>
                    </div>
                  </li>
                );
              })}
              {hasMore ? (
                <li
                  ref={sentinelRef}
                  className="flex h-14 items-center justify-center text-[13px] text-muted-foreground"
                >
                  {loadingMore ? "Loading more…" : null}
                </li>
              ) : matches.length > 0 ? (
                <li className="px-4 py-4 text-center text-[13px] text-muted-foreground">
                  End of the feed
                </li>
              ) : null}
            </ul>
          )}
        </div>
        <div className="hidden min-h-0 overflow-y-auto px-8 py-8 lg:block">
          {selected ? (
            <MatchDetail match={selected} onMark={mark} onVote={vote} />
          ) : (
            <EmptyState title="No selection" description="Choose a post from the list." />
          )}
        </div>
      </div>
      {detailOpen && selected ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
          <div
            className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5"
            style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
          >
            <Button
              type="button"
              variant="ghost"
              className="h-11 min-h-11 px-3 text-[16px]"
              onClick={() => setDetailOpen(false)}
            >
              <X className="size-5" />
              Back
            </Button>
            <OpenOnX href={selected.permalink} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <MatchDetail match={selected} onMark={mark} onVote={vote} compactActions />
          </div>
        </div>
      ) : null}
    </div>
  );
}
