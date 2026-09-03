"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { SettingsGroup } from "@/components/grouped-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export type HandleTableItem = {
  handle: string;
  source: string;
  active: boolean;
  followers: number | null;
  profileUrl: string;
};

type SourceFilter = "all" | "seed" | "added" | "removed";
type SortKey = "handle" | "followers";
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
  showComposer = true,
  readOnly = false,
  embedded = false,
}: {
  title?: string;
  accessory?: ReactNode;
  description?: ReactNode;
  items: HandleTableItem[];
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  addAriaLabel?: string;
  resetLabel?: string;
  onAdd?: (raw: string) => boolean | void | Promise<boolean | void>;
  onRemove?: (handle: string) => void;
  onRestore?: (handle: string) => void;
  onReset?: () => void;
  busy?: boolean;
  compact?: boolean;
  showComposer?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("handle");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const submitDraft = () => {
    const raw = draft.trim();
    if (!raw || !onAdd) return;
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
      return a.handle.localeCompare(b.handle) * dir;
    });
  }, [items, query, sourceFilter, sortKey, sortDir]);

  const activeCount = items.filter((item) => item.active).length;
  const removedCount = items.filter((item) => !item.active).length;
  const addedCount = items.filter((item) => item.source === "added" && item.active).length;
  const computedAccessory =
    accessory ??
    `${activeCount} active${addedCount ? ` · ${addedCount} added` : ""}${removedCount ? ` · ${removedCount} removed` : ""}`;

  const body = loading ? (
    <div className="px-4 py-3.5 text-[15px] text-muted-foreground">{loadingLabel}</div>
  ) : (
    <div className={cn("grid gap-3", embedded ? "px-4 py-3.5" : "px-4 py-3.5")}>
      {description ? (
        <div className="text-[13px] leading-relaxed text-muted-foreground">{description}</div>
      ) : null}
      {!readOnly && (showComposer || onReset) ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {showComposer && onAdd ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="@handle"
                className="max-w-[14rem] rounded-full font-mono"
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
                Add
              </Button>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {onReset ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onReset}>
              {resetLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-9 rounded-full bg-muted/70 pl-8 font-mono shadow-none"
            aria-label={`Search ${title ?? "handles"}`}
          />
        </div>
        <div className="flex rounded-full bg-muted p-0.5">
          {(
            [
              ["all", "All"],
              ["seed", "Seed"],
              ["added", "Added"],
              ["removed", "Removed"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSourceFilter(id)}
              className={
                sourceFilter === id
                  ? "rounded-full bg-background px-2.5 py-1 text-[13px] font-medium text-foreground shadow-sm"
                  : "rounded-full px-2.5 py-1 text-[13px] text-muted-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl bg-muted/40">
        <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-[13px] text-muted-foreground">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => toggleSort("handle")}
          >
            Handle
            <SortIcon active={sortKey === "handle"} dir={sortDir} />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => toggleSort("followers")}
          >
            Followers
            <SortIcon active={sortKey === "followers"} dir={sortDir} />
          </button>
        </div>
        <div className={cn("overflow-auto", compact ? "max-h-[16rem]" : "max-h-[28rem]")}>
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-[15px] text-muted-foreground">
              {query.trim() || sourceFilter !== "all" ? "No handles match that filter." : emptyLabel}
            </div>
          ) : (
            <ul>
              {rows.map((item) => (
                <li
                  key={item.handle}
                  className={cn(
                    "flex min-h-11 items-center gap-3 border-t border-border/80 px-4 py-2",
                    item.active ? "bg-card/40" : "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={item.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 font-mono text-[15px] text-amber-700 hover:underline dark:text-amber-300"
                      aria-label={`Open @${item.handle} on X`}
                    >
                      <span className="truncate">@{item.handle}</span>
                      <ExternalLink className="size-3 shrink-0 opacity-60" />
                    </a>
                    <div className="text-[13px] text-muted-foreground">
                      {sourceLabel(item.source)}
                      {item.active ? "" : " · Removed"}
                    </div>
                  </div>
                  <div className="shrink-0 text-[15px] tabular-nums text-muted-foreground">
                    {formatCompact(item.followers)}
                  </div>
                  {readOnly ? null : item.active ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      className="text-destructive"
                      aria-label={`Remove @${item.handle}`}
                      onClick={() => onRemove?.(item.handle)}
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
                      onClick={() => onRestore?.(item.handle)}
                    >
                      <RotateCcw className="size-3" />
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border/80 px-4 py-1.5 text-[13px] text-muted-foreground">
          {rows.length === items.length ? `${rows.length} accounts` : `${rows.length} of ${items.length}`}
        </div>
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <SettingsGroup title={title} accessory={loading ? undefined : computedAccessory}>
      {body}
    </SettingsGroup>
  );
}
