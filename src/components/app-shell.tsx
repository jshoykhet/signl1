"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BadgeDollarSign, Inbox, Settings2, SlidersHorizontal } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import type { StatusSnapshot } from "@/lib/types";

const NAV = [
  { href: "/", label: "Inbox", icon: Inbox },
  { href: "/watchlist", label: "Watchlist", icon: BadgeDollarSign },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<StatusSnapshot | null>(null);
  const bare = pathname === "/login";

  useEffect(() => {
    if (bare) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as StatusSnapshot;
        if (!cancelled) setStatus(data);
      } catch {
        /* poller or db may still be coming up */
      }
    };
    load();
    const timer = setInterval(load, 4000);
    const onMode = () => {
      void load();
    };
    window.addEventListener("signal1:desk-mode", onMode);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("signal1:desk-mode", onMode);
    };
  }, [bare]);

  if (bare) return <>{children}</>;

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <img
            src="/signal1-logo-256.png"
            alt="Signal1"
            width={32}
            height={32}
            className="size-8 rounded-xl ring-1 ring-amber-400/25"
          />
          <div className="min-w-0 leading-tight">
            <div className="text-[17px] font-semibold tracking-[-0.02em]">Signal1</div>
            <div className="text-[12px] text-muted-foreground">
              {status?.deskFilters.deskMode === "venture" ? "Venture desk" : "Markets desk"}
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-[9px] px-3 text-[15px] transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4 opacity-80" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/" && status && status.counts.unread > 0 ? (
                  <span className="min-w-5 rounded-full bg-amber-400/90 px-1.5 text-center text-[11px] font-semibold text-amber-950">
                    {status.counts.unread}
                  </span>
                ) : null}
                {item.href === "/watchlist" && status && status.counts.tickers > 0 ? (
                  <span className="text-[13px] tabular-nums text-muted-foreground">{status.counts.tickers}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-3 border-t border-sidebar-border px-3 pt-3 pb-4">
          {status?.demoMode ? (
            <div className="rounded-2xl bg-amber-400/15 px-3 py-2.5">
              <div className="text-[13px] font-medium text-amber-800 dark:text-amber-200">Demo mode</div>
              <div className="mt-0.5 text-[12px] leading-snug text-amber-800/70 dark:text-amber-100/60">
                No X bearer token. Fixture tape is playing.
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
              <Activity
                className={cn("size-3.5", status?.poller.healthy ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}
              />
              <span>{status?.poller.healthy ? "Poller healthy" : "Poller waiting"}</span>
            </div>
          )}
          <UserMenu />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 md:hidden">
          <div className="flex items-center gap-2.5">
            <img
              src="/signal1-logo-256.png"
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-xl ring-1 ring-amber-400/25"
            />
            <span className="text-[17px] font-semibold tracking-[-0.02em]">Signal1</span>
          </div>
          <UserMenu compact />
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar/90 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid h-[4.25rem] grid-cols-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                  active ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {item.href === "/" && status && status.counts.unread > 0 ? (
                    <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[9px] font-semibold text-amber-950">
                      {status.counts.unread > 99 ? "99+" : status.counts.unread}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
