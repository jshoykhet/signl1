"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppearanceSettings } from "@/components/appearance-settings";
import { BlockedEditor } from "@/components/blocked-editor";
import { DeskFilters } from "@/components/desk-filters";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { PageHeader } from "@/components/page-header";
import { CadenceSettings } from "@/components/cadence-settings";
import { formatClock, formatRelative } from "@/lib/format";
import { cadenceLabel } from "@/lib/desk-settings";
import { formatUsd } from "@/lib/x-cost";
import type { StatusSnapshot } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <GroupedRow className="items-start justify-between gap-4 sm:items-center">
      <div className="w-[7.5rem] shrink-0 text-[15px] text-muted-foreground sm:w-[9.5rem]">{label}</div>
      <div className="min-w-0 flex-1 text-right text-[15px] leading-snug sm:text-left">{children}</div>
    </GroupedRow>
  );
}

export function SettingsView() {
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load status");
        const data = (await res.json()) as StatusSnapshot;
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load status");
      }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[680px] flex-1 px-4 py-6 sm:px-5 sm:py-8">
        <PageHeader
          title="Settings"
          description="Focus, rules, and the blocked list on this page belong to your desk. Other people who sign in get their own copy."
        />
        <div className="mt-5 space-y-6 sm:mt-8 sm:space-y-8">
          {error ? (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
          ) : null}
          {!status ? (
            <p className="text-[15px] text-muted-foreground">Loading status…</p>
          ) : (
            <>
              {status.account ? (
                <SettingsGroup
                  title="Your desk"
                  footer="Each Google account has its own inbox and filters. The X token and WhatsApp link are shared on this server."
                >
                  <Row label="Signed in">{status.account.email}</Row>
                  <Row label="Role">{status.account.role === "admin" ? "Admin" : "Your desk"}</Row>
                  {status.account.people.length > 1 ? (
                    <Row label="People">
                      {status.account.people
                        .map((person) => person.name?.trim() || person.email)
                        .join(", ")}
                    </Row>
                  ) : null}
                </SettingsGroup>
              ) : null}
              {status.demoMode ? (
                <div className="rounded-2xl bg-amber-400/15 px-4 py-3.5">
                  <div className="text-[15px] font-medium text-amber-800 dark:text-amber-200">Demo mode</div>
                  <p className="mt-1 text-[15px] leading-snug text-amber-800/70 dark:text-amber-50/75">
                    There&apos;s no X token yet. Signl1 is showing sample posts so you can look around.
                  </p>
                </div>
              ) : null}
              <SettingsGroup title="WhatsApp" footer="Pairing, destination, and the agent live on the WhatsApp tab.">
                <GroupedRow>
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-medium tracking-[-0.01em]">WhatsApp agent</div>
                    <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                      Link a number, then text a ticker or search.
                    </div>
                  </div>
                  <Link
                    href="/whatsapp"
                    className="inline-flex shrink-0 items-center gap-0.5 text-[15px] text-amber-700 dark:text-amber-300"
                  >
                    Open
                    <ChevronRight className="size-4 opacity-70" />
                  </Link>
                </GroupedRow>
              </SettingsGroup>
              <AppearanceSettings />
              <SettingsGroup
                title="X API"
                footer={
                  status.grok === "present"
                    ? null
                    : "Without Grok, asks still search X but skip the written brief."
                }
              >
                <Row label="Bearer token">
                  <span
                    className={
                      status.bearerToken === "present"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    {status.bearerToken === "present" ? "Present" : "Missing"}
                  </span>
                </Row>
                <Row label="Grok">
                  <span
                    className={
                      status.grok === "present"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    {status.grok === "present" ? "Present" : "Missing"}
                  </span>
                </Row>
                <Row label="Google sign-in">
                  <span
                    className={
                      status.googleAuth === "present"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    {status.googleAuth === "present" ? "Google" : "Missing client ID"}
                  </span>
                </Row>
                <Row label="Mode">{status.demoMode ? "Sample posts" : "Live"}</Row>
              </SettingsGroup>
              <CadenceSettings />
              <DeskFilters />
              <SettingsGroup
                title="Key Accounts"
                footer="Focus chooses which list is live. Edit people on Accounts."
              >
                <GroupedRow>
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-medium tracking-[-0.01em]">Markets and Venture lists</div>
                    <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                      {status.kol.count} {status.kol.count === 1 ? "person" : "people"} skip the like threshold.
                    </div>
                  </div>
                  <Link
                    href="/accounts"
                    className="inline-flex shrink-0 items-center gap-0.5 text-[15px] text-amber-700 dark:text-amber-300"
                  >
                    Open
                    <ChevronRight className="size-4 opacity-70" />
                  </Link>
                </GroupedRow>
              </SettingsGroup>
              <BlockedEditor />
              <SettingsGroup title="Updates">
                <Row label="Health">
                  <span
                    className={
                      status.poller.healthy ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    {status.poller.healthy ? "Up to date" : "Not responding"}
                  </span>
                </Row>
                <Row label="Reported mode">{status.poller.mode}</Row>
                <Row label="Started">{formatClock(status.poller.startedAt)}</Row>
                <Row label="Last heartbeat">{formatRelative(status.poller.lastHeartbeatAt)}</Row>
                <Row label="Last poll">{formatClock(status.poller.lastPollAt)}</Row>
                <Row label="Manual re-poll">
                  {status.poller.manualPollPending
                    ? "Queued — waiting for the next check"
                    : status.poller.lastManualPollAt
                      ? `Last run ${formatClock(status.poller.lastManualPollAt)}`
                      : "None yet"}
                </Row>
                <Row label="Search calls">{status.poller.searchRequests} since start</Row>
                <Row label="Queries / cycle">
                  {status.poller.lastPackedQueries
                    ? `${status.poller.lastPackedQueries} packed recent-search request${status.poller.lastPackedQueries === 1 ? "" : "s"}`
                    : "—"}
                </Row>
                <Row label="Last search">
                  {status.poller.lastPollAt
                    ? `${status.poller.lastPollPosts} post${status.poller.lastPollPosts === 1 ? "" : "s"} · ${status.poller.lastPollUsers} author${status.poller.lastPollUsers === 1 ? "" : "s"} (~${formatUsd(status.poller.lastPollCostUsd)})`
                    : "—"}
                </Row>
                <Row label="Session reads">
                  {status.poller.postsRead} posts · {status.poller.usersRead} authors (upper bound{" "}
                  {formatUsd(status.poller.estimatedCostUsd)}; X does not rebill the same id the same UTC day)
                </Row>
                <Row label="X remaining">
                  {status.poller.rateLimitRemaining != null
                    ? `${status.poller.rateLimitRemaining}${status.poller.rateLimitLimit != null ? ` / ${status.poller.rateLimitLimit}` : ""}`
                    : "—"}
                </Row>
                <Row label="Window reset">{formatClock(status.poller.rateLimitResetAt)}</Row>
                <Row label="Interval">
                  {cadenceLabel(status.cadenceMinutes)}
                </Row>
                <Row label="Last error">
                  {status.poller.lastError ? (
                    <div>
                      <div className="text-destructive">{status.poller.lastError}</div>
                      <div className="text-[13px] text-muted-foreground">{formatClock(status.poller.lastErrorAt)}</div>
                    </div>
                  ) : (
                    "None"
                  )}
                </Row>
              </SettingsGroup>
              <SettingsGroup title="Training">
                <Row label="Inbox labels">
                  {status.training.high} keep / {status.training.low} hide. Two hide votes quiet that account. Two keep
                  votes let more of their posts through.
                </Row>
              </SettingsGroup>
              <SettingsGroup title="Library">
                <Row label="Rules">
                  {status.counts.rules} ({status.counts.enabledRules} enabled)
                </Row>
                <Row label="Watchlist">{status.counts.tickers} tickers</Row>
                <Row label="Key Accounts">{status.kol.count} handles</Row>
                <Row label="Matches">{status.counts.matches}</Row>
                <Row label="Unread">{status.counts.unread}</Row>
              </SettingsGroup>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
