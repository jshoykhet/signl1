"use client";

import { useEffect, useState } from "react";
import { AppearanceSettings } from "@/components/appearance-settings";
import { BlockedEditor } from "@/components/blocked-editor";
import { DeskFilters } from "@/components/desk-filters";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { KolEditor } from "@/components/kol-editor";
import { PageHeader } from "@/components/page-header";
import { TeamSettings } from "@/components/team-settings";
import { CadenceSettings } from "@/components/cadence-settings";
import { WhatsAppSettings } from "@/components/whatsapp-settings";
import { formatClock, formatRelative } from "@/lib/format";
import { cadenceLabel } from "@/lib/desk-settings";
import { formatUsd } from "@/lib/x-cost";
import type { StatusSnapshot } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <GroupedRow>
      <div className="w-[9.5rem] shrink-0 text-[15px] text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-[15px]">{children}</div>
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
      <div className="mx-auto w-full max-w-[680px] flex-1 px-5 py-8">
        <PageHeader
          title="Settings"
          description="Secrets stay in the process environment. This page never prints the bearer token or Google client secret."
        />
        <div className="mt-8 space-y-8">
          {error ? (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
          ) : null}
          {!status ? (
            <p className="text-[15px] text-muted-foreground">Loading status…</p>
          ) : (
            <>
              {status.demoMode ? (
                <div className="rounded-2xl bg-amber-400/15 px-4 py-3.5">
                  <div className="text-[15px] font-medium text-amber-800 dark:text-amber-200">Demo mode</div>
                  <p className="mt-1 text-[15px] leading-snug text-amber-800/70 dark:text-amber-50/75">
                    <code className="font-mono text-[13px]">X_BEARER_TOKEN</code> is not set. Signl1 is injecting fixture
                    posts for the active desk (markets, venture, or both) so you can exercise rules and the inbox without paid
                    X API access.
                  </p>
                </div>
              ) : null}
              <AppearanceSettings />
              <SettingsGroup title="Brand">
                <Row label="Logo">
                  <a
                    href="/signl1-logo.png"
                    download="signl1_logo.png"
                    className="text-amber-700 underline-offset-4 hover:underline dark:text-amber-300"
                  >
                    Download Signl1 logo
                  </a>
                </Row>
              </SettingsGroup>
              <SettingsGroup title="X API">
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
                <Row label="Mode">{status.demoMode ? "Demo (fixtures)" : "Live (X API v2 recent search)"}</Row>
              </SettingsGroup>
              <TeamSettings />
              <CadenceSettings />
              <WhatsAppSettings />
              <DeskFilters />
              <KolEditor />
              <BlockedEditor />
              <SettingsGroup title="Poller">
                <Row label="Health">
                  <span
                    className={
                      status.poller.healthy ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"
                    }
                  >
                    {status.poller.healthy ? "Healthy" : "No recent heartbeat"}
                  </span>
                </Row>
                <Row label="Reported mode">{status.poller.mode}</Row>
                <Row label="Started">{formatClock(status.poller.startedAt)}</Row>
                <Row label="Last heartbeat">{formatRelative(status.poller.lastHeartbeatAt)}</Row>
                <Row label="Last poll">{formatClock(status.poller.lastPollAt)}</Row>
                <Row label="Manual re-poll">
                  {status.poller.manualPollPending
                    ? "Queued — waiting for the poller tick"
                    : status.poller.lastManualPollAt
                      ? `Last run ${formatClock(status.poller.lastManualPollAt)}`
                      : "None yet"}
                </Row>
                <Row label="Search calls">{status.poller.searchRequests} since poller start</Row>
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
                <Row label="Inbox interval">
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
                  {status.training.high} high / {status.training.low} low. Two net-low votes suppress that account; two
                  net-high votes relax the floors.
                </Row>
              </SettingsGroup>
              <SettingsGroup title="Store">
                <Row label="Rules">
                  {status.counts.rules} ({status.counts.enabledRules} enabled)
                </Row>
                <Row label="Watchlist">{status.counts.tickers} tickers</Row>
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
