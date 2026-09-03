"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { SettingsGroup } from "@/components/grouped-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCompact } from "@/lib/format";
import type { KolSource } from "@/lib/kol";

type KolItem = {
  handle: string;
  custom: boolean;
  source: KolSource;
  active: boolean;
  followers: number | null;
  profileUrl: string;
};

type KolSnapshot = {
  handles: string[];
  count: number;
  added: string[];
  removed: string[];
  seedCount: number;
  deskMode?: "markets" | "venture";
  items: KolItem[];
};

type SourceFilter = "all" | "seed" | "added" | "removed";
type SortKey = "handle" | "followers" | "source" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="size-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

export function KolEditor() {
  const [kol, setKol] = useState<KolSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("handle");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/kol", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load Key Network Nodes");
    setKol((await res.json()) as KolSnapshot);
  };

  useEffect(() => {
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load Key Network Nodes"));
    const onMode = () => {
      void load().catch(() => undefined);
    };
    window.addEventListener("signl1:desk-mode", onMode);
    return () => window.removeEventListener("signl1:desk-mode", onMode);
  }, []);

  const save = async (body: { add?: string; remove?: string; reset?: boolean }, success?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/kol", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as KolSnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update Key Network Nodes");
      setKol(data);
      if (body.add) setDraft("");
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Key Network Nodes");
    } finally {
      setBusy(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "handle" ? "asc" : "desc");
  };

  const rows = useMemo(() => {
    if (!kol) return [];
    const q = query.trim().toLowerCase().replace(/^@/, "");
    const filtered = kol.items.filter((item) => {
      if (q && !item.handle.includes(q)) return false;
      if (sourceFilter === "seed") return item.source === "seed";
      if (sourceFilter === "added") return item.source === "added";
      if (sourceFilter === "removed") return !item.active;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "followers") {
        if (a.followers == null && b.followers == null) return a.handle.localeCompare(b.handle) * dir;
        if (a.followers == null) return 1;
        if (b.followers == null) return -1;
        return (a.followers - b.followers) * dir || a.handle.localeCompare(b.handle);
      }
      if (sortKey === "source") {
        const cmp = a.source.localeCompare(b.source) || a.handle.localeCompare(b.handle);
        return cmp * dir;
      }
      if (sortKey === "status") {
        const cmp = Number(b.active) - Number(a.active) || a.handle.localeCompare(b.handle);
        return cmp * dir;
      }
      return a.handle.localeCompare(b.handle) * dir;
    });
  }, [kol, query, sourceFilter, sortKey, sortDir]);

  const activeCount = kol?.count ?? 0;
  const removedCount = kol?.items.filter((item) => !item.active).length ?? 0;
  const addedCount = kol?.items.filter((item) => item.source === "added" && item.active).length ?? 0;

  return (
    <SettingsGroup
      title="Key Network Nodes"
      accessory={
        kol
          ? `${activeCount} active${addedCount ? ` · ${addedCount} added` : ""}${removedCount ? ` · ${removedCount} removed` : ""}`
          : undefined
      }
    >
      {!kol ? (
        <div className="px-4 py-3.5 text-[15px] text-muted-foreground">Loading Key Network Nodes…</div>
      ) : (
        <div className="grid gap-3 px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Seeded with {kol.seedCount} {kol.deskMode === "venture" ? "venture, startup, and tech-news" : "markets-desk"}{" "}
            handles. These accounts skip the like floor and get a desk bump unless Require likes is on. Click a handle
            to open the X profile. Follower counts come from posts Signl1 has already ingested — accounts with no match
            yet show —. Switching desk mode on Desk tape swaps this seed.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="@handle"
                className="max-w-[14rem] font-mono"
                aria-label="Add Key Network Node handle"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (draft.trim()) void save({ add: draft }, `@${draft.replace(/^@/, "").trim()} added`);
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || !draft.trim()}
                onClick={() => void save({ add: draft }, `@${draft.replace(/^@/, "").trim()} added`)}
              >
                <Plus className="size-3.5" />
                Add row
              </Button>
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save({ reset: true }, "Key Network Nodes reset")}>
              Reset to defaults
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search handles"
                className="pl-8 font-mono"
                aria-label="Search Key Network Nodes"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["seed", "Seed"],
                  ["added", "Added"],
                  ["removed", "Removed"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  size="xs"
                  variant={sourceFilter === id ? "default" : "outline"}
                  onClick={() => setSourceFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl bg-background/50">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[44rem] table-fixed border-collapse text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/70 text-left text-[13px] font-normal text-muted-foreground">
                    <th className="w-[32%] border-b border-border">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("handle")}
                      >
                        Handle
                        <SortIcon active={sortKey === "handle"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-28 border-b border-r border-border">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("followers")}
                      >
                        Followers
                        <SortIcon active={sortKey === "followers"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-24 border-b border-r border-border">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("source")}
                      >
                        Source
                        <SortIcon active={sortKey === "source"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-24 border-b border-r border-border">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("status")}
                      >
                        Status
                        <SortIcon active={sortKey === "status"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-28 border-b border-border px-3 py-2 text-right normal-case">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {query.trim() || sourceFilter !== "all"
                          ? "No handles match that filter."
                          : "No handles yet. Add a row to start the list."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((item) => (
                      <tr
                        key={item.handle}
                        className={item.active ? "hover:bg-muted/50" : "bg-muted/10 text-muted-foreground hover:bg-muted/30"}
                      >
                        <td className="border-r border-b border-border px-3 py-1.5 font-mono text-[13px] leading-6">
                          <a
                            href={item.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1 text-amber-700 dark:text-amber-300 hover:underline"
                            aria-label={`Open @${item.handle} on X`}
                          >
                            <span className="truncate">@{item.handle}</span>
                            <ExternalLink className="size-3 shrink-0 opacity-70" />
                          </a>
                        </td>
                        <td className="border-r border-b border-border px-3 py-1.5 font-mono leading-6 tabular-nums">
                          {formatCompact(item.followers)}
                        </td>
                        <td className="border-r border-b border-border px-3 py-1.5 leading-6">
                          <Badge variant={item.source === "added" ? "default" : "outline"} className="font-normal">
                            {item.source === "added" ? "Added" : "Seed"}
                          </Badge>
                        </td>
                        <td className="border-r border-b border-border px-3 py-1.5 leading-6">
                          {item.active ? (
                            <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300">Removed</span>
                          )}
                        </td>
                        <td className="border-b border-border px-2 py-1 text-right">
                          {item.active ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              disabled={busy}
                              aria-label={`Remove @${item.handle}`}
                              onClick={() => void save({ remove: item.handle }, `@${item.handle} removed`)}
                            >
                              <Trash2 className="size-3" />
                              Remove
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={busy}
                              aria-label={`Restore @${item.handle}`}
                              onClick={() => void save({ add: item.handle }, `@${item.handle} restored`)}
                            >
                              <RotateCcw className="size-3" />
                              Restore
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-3 py-1.5 text-[13px] text-muted-foreground">
              {rows.length === kol.items.length
                ? `${rows.length} rows`
                : `Showing ${rows.length} of ${kol.items.length} rows`}
            </div>
          </div>
        </div>
      )}
    </SettingsGroup>
  );
}
