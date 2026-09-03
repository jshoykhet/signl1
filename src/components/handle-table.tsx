"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { SettingsGroup } from "@/components/grouped-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCompact } from "@/lib/format";

export type HandleTableItem = {
  handle: string;
  source: string;
  active: boolean;
  followers: number | null;
  profileUrl: string;
};

type SourceFilter = "all" | "seed" | "added" | "removed";
type SortKey = "handle" | "followers" | "source" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="size-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />;
}

function sourceLabel(source: string): string {
  if (source === "added") return "Added";
  if (source === "env") return "Env";
  return "Seed";
}

export function HandleTable({
  title,
  accessory,
  description,
  items,
  loading,
  loadingLabel = "Loading…",
  emptyLabel = "No handles yet. Add a row to start the list.",
  addAriaLabel = "Add handle",
  resetLabel = "Reset to defaults",
  onAdd,
  onRemove,
  onRestore,
  onReset,
  busy = false,
  compact = false,
}: {
  title: string;
  accessory?: ReactNode;
  description?: ReactNode;
  items: HandleTableItem[];
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  addAriaLabel?: string;
  resetLabel?: string;
  onAdd: (raw: string) => boolean | void | Promise<boolean | void>;
  onRemove: (handle: string) => void;
  onRestore: (handle: string) => void;
  onReset?: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("handle");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const submitDraft = () => {
    const raw = draft.trim();
    if (!raw) return;
    void Promise.resolve(onAdd(raw)).then((ok) => {
      if (ok !== false) setDraft("");
    });
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
    const q = query.trim().toLowerCase().replace(/^@/, "");
    const filtered = items.filter((item) => {
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
  }, [items, query, sourceFilter, sortKey, sortDir]);

  const activeCount = items.filter((item) => item.active).length;
  const removedCount = items.filter((item) => !item.active).length;
  const addedCount = items.filter((item) => item.source === "added" && item.active).length;
  const computedAccessory =
    accessory ??
    `${activeCount} active${addedCount ? ` · ${addedCount} added` : ""}${removedCount ? ` · ${removedCount} removed` : ""}`;

  return (
    <SettingsGroup title={title} accessory={loading ? undefined : computedAccessory}>
      {loading ? (
        <div className="px-4 py-3.5 text-[15px] text-muted-foreground">{loadingLabel}</div>
      ) : (
        <div className="grid gap-3 px-4 py-3.5">
          {description ? (
            <div className="text-[13px] leading-relaxed text-muted-foreground">{description}</div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="@handle"
                className="max-w-[14rem] font-mono"
                aria-label={addAriaLabel}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitDraft();
                  }
                }}
              />
              <Button type="button" size="sm" disabled={busy || !draft.trim()} onClick={submitDraft}>
                <Plus className="size-3.5" />
                Add row
              </Button>
            </div>
            {onReset ? (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onReset}>
                {resetLabel}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search handles"
                className="pl-8 font-mono"
                aria-label={`Search ${title}`}
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
            <div className={compact ? "max-h-[20rem] overflow-auto" : "max-h-[28rem] overflow-auto"}>
              <table className="w-full min-w-[36rem] table-fixed border-collapse text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/70 text-left text-[13px] font-normal text-muted-foreground">
                    <th className="w-[36%] border-b border-border">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("handle")}
                      >
                        Handle
                        <SortIcon active={sortKey === "handle"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-24 border-b border-r border-border">
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
                        {query.trim() || sourceFilter !== "all" ? "No handles match that filter." : emptyLabel}
                      </td>
                    </tr>
                  ) : (
                    rows.map((item) => (
                      <tr
                        key={item.handle}
                        className={
                          item.active
                            ? "hover:bg-muted/50"
                            : "bg-muted/10 text-muted-foreground hover:bg-muted/30"
                        }
                      >
                        <td className="border-r border-b border-border px-3 py-1.5 font-mono text-[13px] leading-6">
                          <a
                            href={item.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-full items-center gap-1 text-amber-700 hover:underline dark:text-amber-300"
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
                            {sourceLabel(item.source)}
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
                              onClick={() => onRemove(item.handle)}
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
                              onClick={() => onRestore(item.handle)}
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
              {rows.length === items.length ? `${rows.length} rows` : `Showing ${rows.length} of ${items.length} rows`}
            </div>
          </div>
        </div>
      )}
    </SettingsGroup>
  );
}
