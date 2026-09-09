"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { PageHeader } from "@/components/page-header";
import { formatRelative } from "@/lib/format";
import type { UsageSnapshot } from "@/lib/usage";
import { cn } from "@/lib/utils";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-card px-4 py-3.5 shadow-sm ring-1 ring-border">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</div>
      {hint ? <div className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });
}

function LoginChart({ days }: { days: UsageSnapshot["days"] }) {
  const max = Math.max(1, ...days.map((day) => day.uniqueUsers));
  return (
    <div className="px-4 py-4">
      <div className="flex h-28 items-end gap-1">
        {days.map((day) => {
          const height = Math.max(day.uniqueUsers > 0 ? 12 : 3, Math.round((day.uniqueUsers / max) * 100));
          return (
            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <div
                title={`${day.date}: ${day.uniqueUsers} people, ${day.logins} logins`}
                className={cn(
                  "w-full max-w-6 rounded-t-md",
                  day.uniqueUsers > 0 ? "bg-amber-400" : "bg-muted",
                )}
                style={{ height: `${height}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{weekday(day.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const [data, setData] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/analytics", { cache: "no-store" });
        if (res.status === 403) {
          if (!cancelled) {
            setForbidden(true);
            setError(null);
          }
          return;
        }
        if (!res.ok) throw new Error("Failed to load analytics");
        const snapshot = (await res.json()) as UsageSnapshot;
        if (!cancelled) {
          setData(snapshot);
          setForbidden(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[880px] flex-1 px-4 py-6 sm:px-5 sm:py-8">
        <PageHeader
          title="Analytics"
          description="How many people have a SignlHQ, and how often they sign in. Only the instance admin can open this page."
        />
        <div className="mt-5 space-y-6 sm:mt-8 sm:space-y-8">
          {forbidden ? (
            <EmptyState
              title="Admin only"
              description="Analytics is on this instance for the first Google account. Ask the owner if you need the numbers."
            />
          ) : null}
          {error ? (
            <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-[15px] text-destructive">{error}</div>
          ) : null}
          {!forbidden && !data && !error ? (
            <p className="text-[15px] text-muted-foreground">Loading usage…</p>
          ) : null}
          {data ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="People" value={String(data.peopleCount)} hint="Active SignlHQs" />
                <Stat
                  label="Used in 7 days"
                  value={String(data.signedInLast7d)}
                  hint={`${data.signedInLast30d} in the last 30 days`}
                />
                <Stat
                  label="Logins (7 days)"
                  value={String(data.loginsLast7d)}
                  hint={`${data.loginsTotal} recorded in total`}
                />
                <Stat
                  label="New this week"
                  value={String(data.newUsersLast7d)}
                  hint={`${data.newUsersLast30d} in the last 30 days`}
                />
              </div>
              <SettingsGroup
                title="Who signed in"
                footer="Bars are unique people per UTC day. Google sign-in writes one event; a refresh in the same two minutes is not counted twice."
              >
                <LoginChart days={data.days} />
              </SettingsGroup>
              <SettingsGroup
                title="People"
                footer={
                  data.disabledCount > 0
                    ? `${data.disabledCount} disabled ${data.disabledCount === 1 ? "account is" : "accounts are"} listed but not counted in People.`
                    : "Each row is a Google account that opened a SignlHQ."
                }
              >
                {data.people.length === 0 ? (
                  <EmptyState
                    title="No accounts yet"
                    description="When someone signs in with Google, they show up here with a login count."
                  />
                ) : (
                  <>
                    <GroupedRow className="hidden min-h-0 py-2 text-[12px] text-muted-foreground sm:flex">
                      <div className="min-w-0 flex-1">Person</div>
                      <div className="w-16 text-right tabular-nums">Logins</div>
                      <div className="w-14 text-right tabular-nums">7d</div>
                      <div className="w-14 text-right tabular-nums">30d</div>
                      <div className="w-24 text-right">Last in</div>
                    </GroupedRow>
                    {data.people.map((person) => (
                      <GroupedRow key={person.id} className="items-start justify-between gap-3 sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-medium tracking-[-0.01em]">
                            {person.name?.trim() || person.email}
                          </div>
                          <div className="truncate text-[13px] text-muted-foreground">
                            {person.email}
                            {person.role === "admin" ? " · Admin" : ""}
                            {person.disabled ? " · Disabled" : ""}
                          </div>
                          <div className="mt-1 text-[13px] text-muted-foreground sm:hidden">
                            {person.loginCount} logins · {person.loginsLast7d} in 7d · last {formatRelative(person.lastLoginAt)}
                          </div>
                        </div>
                        <div className="hidden w-16 text-right text-[15px] tabular-nums sm:block">{person.loginCount}</div>
                        <div className="hidden w-14 text-right text-[15px] tabular-nums sm:block">{person.loginsLast7d}</div>
                        <div className="hidden w-14 text-right text-[15px] tabular-nums sm:block">{person.loginsLast30d}</div>
                        <div className="hidden w-24 text-right text-[13px] text-muted-foreground sm:block">
                          {formatRelative(person.lastLoginAt)}
                        </div>
                      </GroupedRow>
                    ))}
                  </>
                )}
              </SettingsGroup>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
