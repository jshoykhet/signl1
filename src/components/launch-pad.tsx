"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Flame, Heart, LoaderCircle, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
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

const hideScroll =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function handleHue(handle: string) {
  let hash = 0;
  for (const ch of handle) hash = (hash * 33 + ch.charCodeAt(0)) % 360;
  return hash;
}

function Avatar({ handle }: { handle: string }) {
  const hue = handleHue(handle);
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white sm:size-8"
      style={{
        background: `linear-gradient(160deg, oklch(0.72 0.14 ${hue}) 0%, oklch(0.48 0.1 ${hue}) 100%)`,
      }}
    >
      {handle.slice(0, 1).toUpperCase()}
    </span>
  );
}

function TweetCard({ tweet, compact }: { tweet: LaunchTweet; compact?: boolean }) {
  return (
    <a
      href={tweet.permalink}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 px-4 py-3.5 transition-colors active:bg-black/[0.04] sm:py-3 sm:hover:bg-black/[0.03] dark:active:bg-white/[0.06] dark:sm:hover:bg-white/[0.04]"
    >
      <Avatar handle={tweet.authorHandle} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">@{tweet.authorHandle}</span>
          <span className="ml-auto shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {formatRelative(tweet.tweetCreatedAt)}
          </span>
        </div>
        <p
          className={cn(
            "mt-0.5 text-[15px] leading-[1.35] tracking-[-0.01em] text-foreground/90",
            compact ? "line-clamp-3" : "line-clamp-4",
          )}
        >
          {tweet.text}
        </p>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Heart className="size-3 fill-current opacity-50" />
            {formatCompact(tweet.likeCount)}
          </span>
          {tweet.kol ? <span className="font-medium text-amber-700 dark:text-amber-300">Key</span> : null}
          <span className="truncate">{tweet.ruleName}</span>
        </div>
      </div>
    </a>
  );
}

function HeatCard({ tweet }: { tweet: LaunchTweet }) {
  return (
    <>
      <a
        href={tweet.permalink}
        target="_blank"
        rel="noreferrer"
        className="flex w-[min(78vw,20rem)] shrink-0 snap-start flex-col rounded-[22px] bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04] transition-transform active:scale-[0.98] lg:hidden dark:ring-white/[0.06]"
      >
        <div className="flex items-center gap-2">
          <Avatar handle={tweet.authorHandle} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold tracking-[-0.02em]">@{tweet.authorHandle}</div>
            <div className="text-[12px] text-muted-foreground">{formatRelative(tweet.tweetCreatedAt)}</div>
          </div>
        </div>
        <p className="mt-3 line-clamp-4 text-[15px] leading-[1.35]">{tweet.text}</p>
        <div className="mt-3 flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
          <Heart className="size-3.5 fill-current text-rose-500/80" />
          {formatCompact(tweet.likeCount)}
        </div>
      </a>
      <div className="hidden lg:block">
        <TweetCard tweet={tweet} compact />
      </div>
    </>
  );
}

function ThemeChip({ theme, onAsk }: { theme: LaunchTheme; onAsk: (label: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAsk(theme.label)}
      className="flex w-[min(72vw,18.5rem)] shrink-0 snap-start flex-col rounded-[22px] bg-card p-4 text-left shadow-[0_1px_0_rgba(0,0,0,0.04),0_10px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04] transition-transform active:scale-[0.98] lg:w-full lg:flex-row lg:items-start lg:gap-3 lg:rounded-none lg:px-4 lg:py-3.5 lg:shadow-none lg:ring-0 lg:active:scale-100 lg:hover:bg-black/[0.03] dark:ring-white/[0.06] dark:lg:hover:bg-white/[0.04]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-semibold tracking-[-0.03em] lg:text-[15px]">{theme.label}</div>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{theme.sample.text}</p>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[12px] tabular-nums text-muted-foreground lg:mt-0 lg:shrink-0 lg:flex-col lg:items-end lg:gap-0">
        <span>{theme.count} posts</span>
        <span>{formatCompact(theme.likes)} likes</span>
      </div>
    </button>
  );
}

function Surface({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[24px] bg-card shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.045)] ring-1 ring-black/[0.04] dark:ring-white/[0.07]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function LaunchSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)_minmax(0,0.85fr)]">
      {[0, 1, 2].map((col) => (
        <div key={col} className="space-y-3">
          <div className="h-3 w-24 animate-pulse rounded-full bg-foreground/10" />
          <div className="h-48 animate-pulse rounded-[24px] bg-foreground/[0.06]" />
          <div className="h-32 animate-pulse rounded-[24px] bg-foreground/[0.05]" />
        </div>
      ))}
    </div>
  );
}

export function LaunchPad() {
  const [board, setBoard] = useState<LaunchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [asking, setAsking] = useState(false);
  const researchRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (!research) return;
    researchRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [research]);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-black/[0.04] bg-background/75 px-4 pt-2 pb-3 backdrop-blur-2xl sm:px-6 sm:pt-5 sm:pb-4 dark:border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 sm:gap-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[32px] leading-none font-semibold tracking-[-0.045em] sm:text-[40px]">
                Today
              </h1>
              <p className="mt-1 hidden text-[15px] text-muted-foreground sm:block">What matters on X right now.</p>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/inbox"
                className="inline-flex min-h-11 items-center gap-0.5 pr-1 text-[15px] font-medium text-amber-700 sm:min-h-0 dark:text-amber-300"
              >
                Inbox
                <ChevronRight className="size-4 opacity-70" />
              </Link>
              <div className="md:hidden">
                <UserMenu compact />
              </div>
            </div>
          </div>
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about X"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              className="h-12 rounded-full border-0 bg-black/[0.05] pr-[5.75rem] pl-11 text-[17px] shadow-none focus-visible:bg-black/[0.06] focus-visible:ring-0 sm:h-14 sm:pr-28 sm:text-[17px] dark:bg-white/[0.08] dark:focus-visible:bg-white/[0.1]"
              aria-label="Research X"
            />
            <Button
              type="submit"
              disabled={asking}
              className="absolute top-1/2 right-1.5 h-9 min-h-9 -translate-y-1/2 rounded-full px-3.5 text-[14px] sm:right-2 sm:h-10 sm:px-4 sm:text-[15px]"
            >
              {asking ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-3.5" />}
              {asking ? "…" : "Ask"}
            </Button>
          </form>
          {board ? (
            <p className="px-1 text-[12px] text-muted-foreground">
              {board.grok === "present" ? "Grok on" : "Grok off — searches still run"}
              <span className="mx-1.5 text-foreground/20">·</span>
              {board.bearerToken === "present" ? "Live X" : "Sample tape"}
              {board.usedFallbackWindow ? (
                <>
                  <span className="mx-1.5 text-foreground/20">·</span>
                  Wider than 24h
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="mx-4 mt-4 rounded-[20px] bg-destructive/10 px-4 py-3 text-[15px] text-destructive sm:mx-6">
          {error}
        </div>
      ) : null}

      {research ? (
        <section
          ref={researchRef}
          className="scroll-mt-28 border-b border-black/[0.04] px-4 py-5 sm:px-6 dark:border-white/[0.06]"
        >
          <div className="mx-auto w-full max-w-[1180px]">
            <SectionLabel>Research</SectionLabel>
            <h2 className="text-[22px] font-semibold tracking-[-0.03em] sm:text-[24px]">{research.question}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {research.plan.queries.join(" · ")}
              {research.demo ? " · sample" : ""}
              {research.grok ? " · Grok" : ""}
            </p>
            <Surface className="mt-4">
              <div className="whitespace-pre-wrap px-5 py-4 text-[16px] leading-[1.47] tracking-[-0.011em] sm:px-6 sm:py-5">
                {research.brief}
              </div>
              {research.hits.length ? (
                <div className="divide-y divide-black/[0.06] border-t border-black/[0.06] dark:divide-white/[0.08] dark:border-white/[0.08]">
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
            </Surface>
          </div>
        </section>
      ) : null}

      {!board ? (
        <LaunchSkeleton />
      ) : board.top.length === 0 ? (
        <EmptyState
          title="Quiet so far"
          description="Nothing on the desk yet. Re-poll from Inbox, or ask a question above."
        />
      ) : (
        <div className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-5 pb-8 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)_minmax(0,0.85fr)] lg:items-start">
          <section className="min-w-0">
            <SectionLabel>Developing</SectionLabel>
            <div
              className={cn(
                "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0 lg:shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.045)]",
                hideScroll,
                "lg:overflow-hidden lg:rounded-[24px] lg:bg-card lg:ring-1 lg:ring-black/[0.04] dark:lg:ring-white/[0.07]",
              )}
            >
              {board.themes.length === 0 ? (
                <p className="px-4 py-4 text-[15px] text-muted-foreground">No clustered themes yet.</p>
              ) : (
                board.themes.map((theme) => (
                  <div
                    key={theme.id}
                    className="shrink-0 lg:shrink lg:border-b lg:border-black/[0.06] lg:last:border-b-0 dark:lg:border-white/[0.08]"
                  >
                    <ThemeChip theme={theme} onAsk={(label) => void ask(label)} />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="min-w-0">
            <SectionLabel>Worth a look</SectionLabel>
            <Surface>
              <div className="divide-y divide-black/[0.06] dark:divide-white/[0.08]">
                {board.top.map((tweet) => (
                  <TweetCard key={tweet.id} tweet={tweet} />
                ))}
              </div>
            </Surface>
          </section>

          <section className="min-w-0">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <Flame className="size-3.5 text-amber-600" />
                Heat
              </span>
            </SectionLabel>
            <div
              className={cn(
                "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0",
                hideScroll,
                "lg:overflow-hidden lg:rounded-[24px] lg:bg-card lg:shadow-[0_1px_0_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.045)] lg:ring-1 lg:ring-black/[0.04] dark:lg:ring-white/[0.07]",
              )}
            >
              {board.heat.length === 0 ? (
                <p className="px-4 py-4 text-[15px] text-muted-foreground">No liked posts in this window.</p>
              ) : (
                board.heat.map((tweet) => (
                  <div
                    key={tweet.id}
                    className="shrink-0 lg:shrink lg:border-b lg:border-black/[0.06] lg:last:border-b-0 dark:lg:border-white/[0.08]"
                  >
                    <HeatCard tweet={tweet} />
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
