"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BadgeDollarSign, ChartColumn, House, Inbox, MessageCircle, Radar, Settings2, SlidersHorizontal, Users } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { DESK_MODES } from "@/lib/desk-mode";
import type { StatusSnapshot } from "@/lib/types";

const NAV = [
  { href: "/", label: "Launch", icon: House },
  { href: "/inbox", label: "Feed", icon: Inbox },
  { href: "/analyze", label: "Analyze", icon: Radar },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
  { href: "/watchlist", label: "Watchlist", icon: BadgeDollarSign },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function navFor(status: StatusSnapshot | null) {
  return NAV.filter((item) => {
    if (item.href === "/whatsapp" && status?.account?.role === "operator") return false;
    if (item.href === "/analytics") return status?.account?.role === "admin";
    return true;
  });
}

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
    window.addEventListener("signl1:desk-mode", onMode);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("signl1:desk-mode", onMode);
    };
  }, [bare]);

  if (bare) return <>{children}</>;

  const hideMobileBrand = pathname === "/";

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <aside className="hidden h-full w-[232px] shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/80 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <img
            src="/signl1-logo-256.png"
            alt="Signl1"
            width={32}
            height={32}
            className="size-8 rounded-xl ring-1 ring-amber-400/25"
          />
          <div className="min-w-0 leading-tight">
            <div className="text-[17px] font-semibold tracking-[-0.02em]">Signl1</div>
            <div className="text-[12px] text-muted-foreground">
              {status ? (
                <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
                  {DESK_MODES[status.deskFilters.deskMode].shortLabel}
                </span>
              ) : (
                "SignlHQ"
              )}
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {navFor(status).map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-full px-3 text-[15px] transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                )}
              >
                <Icon className="size-4 opacity-80" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/inbox" && status && status.counts.unread > 0 ? (
                  <span className="min-w-5 rounded-full bg-amber-400/90 px-1.5 text-center text-[11px] font-semibold text-amber-950">
                    {status.counts.unread}
                  </span>
                ) : null}
                {item.href === "/whatsapp" && status && !status.whatsappLinked ? (
                  <span className="rounded-full bg-amber-400/90 px-1.5 text-center text-[11px] font-semibold text-amber-950">
                    Link
                  </span>
                ) : null}
                {item.href === "/watchlist" && status && status.counts.tickers > 0 ? (
                  <span className="text-[13px] tabular-nums text-muted-foreground">{status.counts.tickers}</span>
                ) : null}
                {item.href === "/accounts" && status && status.kol.count > 0 ? (
                  <span className="text-[13px] tabular-nums text-muted-foreground">{status.kol.count}</span>
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
                Sample posts while you look around.
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 text-[12px] text-muted-foreground">
              <Activity
                className={cn("size-3.5", status?.poller.healthy ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}
              />
              <span>{status?.poller.healthy ? "Up to date" : "Waiting"}</span>
            </div>
          )}
          <UserMenu />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {hideMobileBrand ? null : (
          <header className="flex items-center justify-between gap-3 border-b border-black/[0.04] bg-background/75 px-4 py-2.5 backdrop-blur-2xl md:hidden dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <img
                src="/signl1-logo-256.png"
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-[10px] ring-1 ring-black/5"
              />
              <span className="text-[17px] font-semibold tracking-[-0.03em]">Signl1</span>
            </div>
            <UserMenu compact />
          </header>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] bg-background/80 backdrop-blur-2xl md:hidden dark:border-white/[0.08]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid h-16 grid-cols-5">
          {navFor(status)
            .filter(
              (item) =>
                item.href !== "/rules" &&
                item.href !== "/accounts" &&
                item.href !== "/watchlist" &&
                item.href !== "/analytics",
            )
            .map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex touch-manipulation flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-[-0.01em]",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn("relative rounded-full px-3 py-1", active && "bg-foreground/10")}>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                  {item.href === "/inbox" && status && status.counts.unread > 0 ? (
                    <span className="absolute -top-0.5 -right-1 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[10px] font-semibold text-amber-950">
                      {status.counts.unread > 99 ? "99+" : status.counts.unread}
                    </span>
                  ) : null}
                  {item.href === "/whatsapp" && status && !status.whatsappLinked ? (
                    <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-400" />
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
