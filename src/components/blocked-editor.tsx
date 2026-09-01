"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCompact } from "@/lib/format";
import type { BlockedSource } from "@/lib/blocked";

type BlockedItem = {
  handle: string;
  custom: boolean;
  source: BlockedSource;
  active: boolean;
  followers: number | null;
  profileUrl: string;
};

type BlockedSnapshot = {
  handles: string[];
  count: number;
  added: string[];
  removed: string[];
  items: BlockedItem[];
};

type SourceFilter = "all" | "added" | "env" | "removed";
type SortKey = "handle" | "followers" | "source" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="size-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

export function BlockedEditor() {
  const [blocked, setBlocked] = useState<BlockedSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("handle");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/blocked", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load blocked list");
    setBlocked((await res.json()) as BlockedSnapshot);
  };

  useEffect(() => {
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load blocked list"));
  }, []);

  const save = async (body: { add?: string; remove?: string; reset?: boolean }, success?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/blocked", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as BlockedSnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update blocked list");
      setBlocked(data);
      if (body.add) setDraft("");
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update blocked list");
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
    if (!blocked) return [];
    const q = query.trim().toLowerCase().replace(/^@/, "");
    const filtered = blocked.items.filter((item) => {
      if (q && !item.handle.includes(q)) return false;
      if (sourceFilter === "added") return item.source === "added";
      if (sourceFilter === "env") return item.source === "env";
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
  }, [blocked, query, sourceFilter, sortKey, sortDir]);

  const activeCount = blocked?.count ?? 0;
  const removedCount = blocked?.items.filter((item) => !item.active).length ?? 0;
  const addedCount = blocked?.items.filter((item) => item.source === "added" && item.active).length ?? 0;
  const envCount = blocked?.items.filter((item) => item.source === "env" && item.active).length ?? 0;

  return (
    <section className="overflow-hidden rounded-lg border border-border/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/30 px-4 py-2">
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Blocked</div>
        {blocked ? (
          <div className="font-mono text-[11px] text-muted-foreground">
            {activeCount} blocked
            {addedCount ? ` · ${addedCount} added` : ""}
            {envCount ? ` · ${envCount} env` : ""}
            {removedCount ? ` · ${removedCount} restored` : ""}
          </div>
        ) : null}
      </div>
      {!blocked ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">Loading blocked list…</div>
      ) : (
        <div className="grid gap-3 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Drop these accounts from the inbox and Slack/WhatsApp, even if they are Key Network Nodes or you labeled a
            post high. Remove keeps the row so you can restore. Follower counts come from posts Signal1 has already
            ingested.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="@handle"
                className="max-w-[14rem] font-mono"
                aria-label="Block handle"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (draft.trim()) void save({ add: draft }, `@${draft.replace(/^@/, "").trim()} blocked`);
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || !draft.trim()}
                onClick={() => void save({ add: draft }, `@${draft.replace(/^@/, "").trim()} blocked`)}
              >
                <Plus className="size-3.5" />
                Add row
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void save({ reset: true }, "Blocked list cleared")}
            >
              Clear list
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
                aria-label="Search blocked list"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["added", "Added"],
                  ["env", "Env"],
                  ["removed", "Restored"],
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
          <div className="overflow-hidden rounded-md border border-white/20 bg-background">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[44rem] table-fixed border-collapse text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted text-left text-[11px] font-medium normal-case text-muted-foreground">
                    <th className="w-[32%] border-b border-r border-white/20">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("handle")}
                      >
                        Handle
                        <SortIcon active={sortKey === "handle"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-28 border-b border-r border-white/20">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("followers")}
                      >
                        Followers
                        <SortIcon active={sortKey === "followers"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-24 border-b border-r border-white/20">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("source")}
                      >
                        Source
                        <SortIcon active={sortKey === "source"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-24 border-b border-r border-white/20">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("status")}
                      >
                        Status
                        <SortIcon active={sortKey === "status"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-28 border-b border-white/20 px-3 py-2 text-right normal-case">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {query.trim() || sourceFilter !== "all"
                          ? "No handles match that filter."
                          : "No blocked accounts. Add a row to mute a handle."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((item) => (
                      <tr
                        key={item.handle}
                        className={item.active ? "hover:bg-muted/50" : "bg-muted/10 text-muted-foreground hover:bg-muted/30"}
                      >
                        <td className="border-r border-b border-white/20 px-3 py-1.5 font-mono text-[13px] leading-6">
                          <a
                            href={item.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1 text-amber-300 hover:underline"
                            aria-label={`Open @${item.handle} on X`}
                          >
                            <span className="truncate">@{item.handle}</span>
                            <ExternalLink className="size-3 shrink-0 opacity-70" />
                          </a>
                        </td>
                        <td className="border-r border-b border-white/20 px-3 py-1.5 font-mono leading-6 tabular-nums">
                          {formatCompact(item.followers)}
                        </td>
                        <td className="border-r border-b border-white/20 px-3 py-1.5 leading-6">
                          <Badge variant={item.source === "added" ? "default" : "outline"} className="font-normal">
                            {item.source === "env" ? "Env" : "Added"}
                          </Badge>
                        </td>
                        <td className="border-r border-b border-white/20 px-3 py-1.5 leading-6">
                          {item.active ? (
                            <span className="text-red-400">Blocked</span>
                          ) : (
                            <span className="text-amber-300">Restored</span>
                          )}
                        </td>
                        <td className="border-b border-white/20 px-2 py-1 text-right">
                          {item.active ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              disabled={busy}
                              aria-label={`Unblock @${item.handle}`}
                              onClick={() => void save({ remove: item.handle }, `@${item.handle} restored`)}
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
                              aria-label={`Block @${item.handle} again`}
                              onClick={() => void save({ add: item.handle }, `@${item.handle} blocked`)}
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
            <div className="border-t border-white/20 bg-muted/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
              {rows.length === blocked.items.length
                ? `${rows.length} rows`
                : `Showing ${rows.length} of ${blocked.items.length} rows`}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
