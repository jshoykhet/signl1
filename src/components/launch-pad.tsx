"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, LayoutDashboard, LoaderCircle, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { OpenOnX } from "@/components/open-on-x";
import { formatCompact, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LaunchTheme, LaunchTweet } from "@/lib/launch-board";
import type { ResearchResult } from "@/lib/research";

type LaunchPayload = {
  top: LaunchTweet[];
  heat: LaunchTweet[];
  themes: LaunchTheme[];
  usedFallbackWindow: boolean;
  demoMode: boolean;
  grok: "present" | "missing";
  bearerToken: "present" | "missing";
  scanned: number;
};

function TweetCard({ tweet, compact }: { tweet: LaunchTweet; compact?: boolean }) {
  return (
    <article className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[16px] font-semibold tracking-[-0.01em] sm:text-[15px]">@{tweet.authorHandle}</span>
        <span className="truncate text-[13px] text-muted-foreground">{tweet.authorName}</span>
        <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {formatRelative(tweet.tweetCreatedAt)}
        </span>
      </div>
      <p className={cn("mt-1 text-[15px] leading-snug", compact ? "line-clamp-3" : "line-clamp-4")}>{tweet.text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="h-5 rounded-full px-2 text-[11px] font-normal">
          {tweet.ruleName}
        </Badge>
        {tweet.kol ? (
          <Badge className="h-5 rounded-full bg-amber-400/20 px-2 text-[11px] font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
            Key
          </Badge>
        ) : null}
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {formatCompact(tweet.likeCount)} likes
        </span>
        <OpenOnX href={tweet.permalink} className="ml-auto h-8" />
      </div>
    </article>
  );
}

export function LaunchPad() {
  const [board, setBoard] = useState<LaunchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [asking, setAsking] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/launch", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load the launch pad");
      setBoard((await res.json()) as LaunchPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the launch pad");
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 12_000);
    return () => clearInterval(timer);
  }, []);

  const ask = async (nextQuestion?: string) => {
    const q = (nextQuestion ?? question).trim();
    if (nextQuestion) setQuestion(nextQuestion);
    if (q.length < 2) {
      toast.error("Ask something specific — a ticker, person, or event.");
      return;
    }
    setAsking(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as ResearchResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Research failed");
      setResearch(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Research failed");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="border-b border-border px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <LayoutDashboard className="size-3.5" />
                Launch pad
              </div>
              <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.022em]">What matters now</h1>
              <p className="mt-1 max-w-xl text-[15px] leading-snug text-muted-foreground">
                Top posts from the tape, themes taking shape, and a Grok-powered ask box that searches X for you.
              </p>
            </div>
            <Link href="/inbox" className="text-[15px] text-amber-700 dark:text-amber-300">
              Open full inbox
            </Link>
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask Grok to research X — FOMC odds, $NVDA reaction, who is funding X…"
                className="h-12 rounded-2xl bg-muted pl-10 text-[16px]"
                aria-label="Research X"
              />
            </div>
            <Button type="submit" className="h-12 min-h-12 px-5 text-[16px] sm:w-auto" disabled={asking}>
              {asking ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {asking ? "Searching…" : "Research"}
            </Button>
          </form>
          {board ? (
            <p className="text-[13px] text-muted-foreground">
              {board.grok === "present" ? "Grok is on." : "No XAI_API_KEY — asks still hit X, without a written brief."}{" "}
              {board.bearerToken === "present" ? "Live X." : "Sample posts."}
              {board.usedFallbackWindow ? " Showing more than the last 24h until the tape fills." : ""}
            </p>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
      ) : null}

      {research ? (
        <section className="border-b border-border px-4 py-5 sm:px-6">
          <div className="mx-auto w-full max-w-6xl">
            <div className="text-[13px] font-medium text-muted-foreground">Research</div>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">{research.question}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {research.plan.queries.join(" · ")}
              {research.demo ? " · sample tape" : ""}
              {research.grok ? " · Grok" : " · no Grok"}
            </p>
            <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-card px-4 py-4 text-[16px] leading-relaxed shadow-sm ring-1 ring-border">
              {research.brief}
            </div>
            {research.hits.length ? (
              <div className="mt-4 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
                {research.hits.map((hit) => (
                  <TweetCard
                    key={hit.id}
                    tweet={{
                      id: hit.id,
                      tweetId: hit.id,
                      authorHandle: hit.authorHandle,
                      authorName: hit.authorName,
                      text: hit.text,
                      permalink: hit.permalink,
                      matchedAt: hit.createdAt,
                      tweetCreatedAt: hit.createdAt,
                      likeCount: hit.likeCount,
                      followersCount: 0,
                      signalScore: 0,
                      kol: false,
                      ruleName: "Research",
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {!board ? (
        <EmptyState title="Loading" description="Pulling today's tape." />
      ) : board.top.length === 0 ? (
        <EmptyState
          title="Tape is quiet"
          description="Nothing on the desk yet. Re-poll from Inbox, or ask a research question above."
        />
      ) : (
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <section>
            <h2 className="px-1 text-[13px] text-muted-foreground">Developing today</h2>
            <div className="mt-2 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              {board.themes.length === 0 ? (
                <p className="px-4 py-4 text-[15px] text-muted-foreground">No clustered themes yet.</p>
              ) : (
                board.themes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
                    onClick={() => void ask(theme.label)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-semibold tracking-[-0.015em]">{theme.label}</div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{theme.sample.text}</p>
                    </div>
                    <div className="shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
                      {theme.count} posts
                      <div>{formatCompact(theme.likes)} likes</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="px-1 text-[13px] text-muted-foreground">Worth a look</h2>
            <div className="mt-2 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              {board.top.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
              <Flame className="size-3.5 text-amber-600" />
              High engagement
            </h2>
            <div className="mt-2 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              {board.heat.length === 0 ? (
                <p className="px-4 py-4 text-[15px] text-muted-foreground">No liked posts in this window.</p>
              ) : (
                board.heat.map((tweet) => <TweetCard key={tweet.id} tweet={tweet} compact />)
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
