"use client";

import { useEffect, useState } from "react";
import { BlockedEditor } from "@/components/blocked-editor";
import { DeskFilters } from "@/components/desk-filters";
import { KolEditor } from "@/components/kol-editor";
import { TeamSettings } from "@/components/team-settings";
import { WhatsAppSettings } from "@/components/whatsapp-settings";
import { formatClock, formatRelative } from "@/lib/format";
import type { StatusSnapshot } from "@/lib/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 border-b border-border/60 px-4 py-2.5 text-[13px]">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
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
      <header className="border-b border-border/80 px-5 py-3">
        <h1 className="text-sm font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground">
          Secrets stay in the process environment. This page never prints the bearer token or Google client secret.
        </p>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {!status ? (
          <p className="text-sm text-muted-foreground">Loading status…</p>
        ) : (
          <div className="space-y-6">
            {status.demoMode ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <div className="text-xs font-semibold tracking-wider text-amber-300 uppercase">Demo mode</div>
                <p className="mt-1 text-sm text-amber-50/80">
                  <code className="font-mono text-[12px]">X_BEARER_TOKEN</code> is not set. Signal1 is injecting fixture
                  markets posts on a timer so you can exercise rules and the inbox without paid X API access.
                </p>
              </div>
            ) : null}
            <section className="overflow-hidden rounded-lg border border-border/80">
              <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Brand
              </div>
              <Row label="Logo">
                <a
                  href="/signal1-logo.png"
                  download="signal1_logo.png"
                  className="text-amber-300 underline-offset-4 hover:underline"
                >
                  Download Signal1 logo (PNG, 1024×1024)
                </a>
              </Row>
            </section>
            <section className="overflow-hidden rounded-lg border border-border/80">
              <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                X API
              </div>
              <Row label="Bearer token">
                <span className={status.bearerToken === "present" ? "text-emerald-400" : "text-amber-300"}>
                  {status.bearerToken === "present" ? "Present" : "Missing"}
                </span>
              </Row>
              <Row label="Mode">{status.demoMode ? "Demo (fixtures)" : "Live (X API v2 recent search)"}</Row>
            </section>
            <TeamSettings />
            <WhatsAppSettings />
            <DeskFilters />
            <KolEditor />
            <BlockedEditor />
            <section className="overflow-hidden rounded-lg border border-border/80">
              <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Poller
              </div>
              <Row label="Health">
                <span className={status.poller.healthy ? "text-emerald-400" : "text-amber-300"}>
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
              <Row label="X remaining">
                {status.poller.rateLimitRemaining != null
                  ? `${status.poller.rateLimitRemaining}${status.poller.rateLimitLimit != null ? ` / ${status.poller.rateLimitLimit}` : ""}`
                  : "—"}
              </Row>
              <Row label="Window reset">{formatClock(status.poller.rateLimitResetAt)}</Row>
              <Row label="Quiet backoff">
                {status.poller.idleBackoffMs
                  ? `+${Math.round(status.poller.idleBackoffMs / 1000)}s after empty polls`
                  : "None"}
              </Row>
              <Row label="Last error">
                {status.poller.lastError ? (
                  <div>
                    <div className="text-destructive">{status.poller.lastError}</div>
                    <div className="text-[11px] text-muted-foreground">{formatClock(status.poller.lastErrorAt)}</div>
                  </div>
                ) : (
                  "None"
                )}
              </Row>
            </section>
            <section className="overflow-hidden rounded-lg border border-border/80">
              <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Training
              </div>
              <Row label="Inbox labels">
                {status.training.high} high / {status.training.low} low. Two net-low votes suppress that account; two
                net-high votes relax the floors.
              </Row>
            </section>
            <section className="overflow-hidden rounded-lg border border-border/80">
              <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Store
              </div>
              <Row label="Rules">{status.counts.rules} ({status.counts.enabledRules} enabled)</Row>
              <Row label="Watchlist">{status.counts.tickers} tickers</Row>
              <Row label="Matches">{status.counts.matches}</Row>
              <Row label="Unread">{status.counts.unread}</Row>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
