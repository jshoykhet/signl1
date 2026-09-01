"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KolSource } from "@/lib/kol";

type KolItem = {
  handle: string;
  custom: boolean;
  source: KolSource;
  active: boolean;
};

type KolSnapshot = {
  handles: string[];
  count: number;
  added: string[];
  removed: string[];
  seedCount: number;
  items: KolItem[];
};

type SourceFilter = "all" | "seed" | "added" | "removed";
type SortKey = "handle" | "source" | "status";
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
    if (!res.ok) throw new Error("Failed to load KOL list");
    setKol((await res.json()) as KolSnapshot);
  };

  useEffect(() => {
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load KOL list"));
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
      if (!res.ok) throw new Error(data.error ?? "Could not update KOL list");
      setKol(data);
      if (body.add) setDraft("");
      if (success) toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update KOL list");
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
    <section className="overflow-hidden rounded-lg border border-border/80">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-muted/30 px-4 py-2">
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">KOL list</div>
        {kol ? (
          <div className="font-mono text-[11px] text-muted-foreground">
            {activeCount} active
            {addedCount ? ` · ${addedCount} added` : ""}
            {removedCount ? ` · ${removedCount} removed` : ""}
          </div>
        ) : null}
      </div>
      {!kol ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">Loading KOL list…</div>
      ) : (
        <div className="grid gap-3 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Seeded with {kol.seedCount} markets-desk handles. Each row is one account. Remove keeps the seed handle in
            the table so you can restore it; Reset restores the original list (env{" "}
            <code className="font-mono text-[11px]">KOL_HANDLES</code> extras stay).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="@handle"
                className="max-w-[14rem] font-mono"
                aria-label="Add KOL handle"
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
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save({ reset: true }, "KOL list reset")}>
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
                aria-label="Search KOL list"
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
          <div className="overflow-hidden rounded-md border border-border/80">
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[36rem] table-fixed border-collapse text-[13px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/95 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
                    <th className="w-[42%] min-w-[10rem] border-b border-r border-border/80">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("handle")}
                      >
                        Handle
                        <SortIcon active={sortKey === "handle"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-[22%] min-w-[6.5rem] border-b border-r border-border/80">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("source")}
                      >
                        Source
                        <SortIcon active={sortKey === "source"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-[18%] min-w-[5.5rem] border-b border-r border-border/80">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:text-foreground"
                        onClick={() => toggleSort("status")}
                      >
                        Status
                        <SortIcon active={sortKey === "status"} dir={sortDir} />
                      </button>
                    </th>
                    <th className="w-[18%] min-w-[5.5rem] border-b border-border/80 px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {query.trim() || sourceFilter !== "all"
                          ? "No handles match that filter."
                          : "No handles yet. Add a row to start the list."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((item, index) => (
                      <tr
                        key={item.handle}
                        className={`border-b border-border/60 last:border-b-0 hover:bg-muted/40 ${
                          item.active ? "" : "text-muted-foreground"
                        } ${index % 2 === 1 ? "bg-muted/15" : ""}`}
                      >
                        <td className="border-r border-border/60 px-3 py-1.5 font-mono text-[13px]">
                          @{item.handle}
                        </td>
                        <td className="border-r border-border/60 px-3 py-1.5">
                          <Badge variant={item.source === "added" ? "default" : "outline"} className="font-normal">
                            {item.source === "added" ? "Added" : "Seed"}
                          </Badge>
                        </td>
                        <td className="border-r border-border/60 px-3 py-1.5">
                          {item.active ? (
                            <span className="text-emerald-400">Active</span>
                          ) : (
                            <span className="text-amber-300">Removed</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
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
            <div className="border-t border-border/80 bg-muted/20 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
              {rows.length === kol.items.length
                ? `${rows.length} rows`
                : `Showing ${rows.length} of ${kol.items.length} rows`}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
