"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Inbox, Radio, Settings2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusSnapshot } from "@/lib/types";

const NAV = [
  { href: "/", label: "Inbox", icon: Inbox },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<StatusSnapshot | null>(null);

  useEffect(() => {
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
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex min-h-full bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border/80 bg-sidebar">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex size-7 items-center justify-center rounded-md bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
            <Radio className="size-3.5" />
          </span>
          <div className="leading-tight">
            <div className="font-heading text-sm font-semibold tracking-wide">Signal</div>
            <div className="font-mono text-[10px] text-muted-foreground">X alerts · self-hosted</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span className="flex-1">{item.label}</span>
                {item.href === "/" && status && status.counts.unread > 0 ? (
                  <span className="rounded-full bg-amber-500/20 px-1.5 font-mono text-[10px] text-amber-300">
                    {status.counts.unread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-border/80 p-3">
          {status?.demoMode ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
              <div className="text-[10px] font-semibold tracking-wider text-amber-300 uppercase">Demo mode</div>
              <div className="text-[11px] leading-snug text-amber-100/70">
                No X bearer token. Fixture tape is playing.
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1.5">
              <div className="text-[10px] font-semibold tracking-wider text-emerald-300 uppercase">Live</div>
              <div className="text-[11px] text-emerald-100/70">X API v2 recent search</div>
            </div>
          )}
          <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <Activity
              className={cn("size-3", status?.poller.healthy ? "text-emerald-400" : "text-zinc-500")}
            />
            <span>{status?.poller.healthy ? "Poller healthy" : "Poller waiting"}</span>
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
