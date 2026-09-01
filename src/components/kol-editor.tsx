"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type KolSnapshot = {
  handles: string[];
  count: number;
  added: string[];
  removed: string[];
  seedCount: number;
  items: Array<{ handle: string; custom: boolean }>;
};

export function KolEditor() {
  const [kol, setKol] = useState<KolSnapshot | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/kol", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load KOL list");
    setKol((await res.json()) as KolSnapshot);
  };

  useEffect(() => {
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load KOL list"));
  }, []);

  const save = async (body: { add?: string; remove?: string; reset?: boolean }) => {
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update KOL list");
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(() => {
    if (!kol) return [];
    const q = query.trim().toLowerCase().replace(/^@/, "");
    if (!q) return kol.items;
    return kol.items.filter((item) => item.handle.includes(q));
  }, [kol, query]);

  return (
    <section className="overflow-hidden rounded-lg border border-border/80">
      <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        KOL list
      </div>
      {!kol ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">Loading KOL list…</div>
      ) : (
        <div className="grid gap-3 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Seeded with {kol.seedCount} markets-desk handles. Add or remove freely. Reset restores the seed (env{" "}
            <code className="font-mono text-[11px]">KOL_HANDLES</code> extras stay). KOLs skip the like floor unless
            Engagement is on; they still need a catalyst.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="@handle"
              className="max-w-xs font-mono"
              aria-label="Add KOL handle"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (draft.trim()) void save({ add: draft });
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !draft.trim()}
              onClick={() => void save({ add: draft })}
            >
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save({ reset: true })}>
              Reset to defaults
            </Button>
            <span className="text-[12px] text-muted-foreground">{kol.count} handles</span>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter list"
            className="max-w-xs"
            aria-label="Filter KOL list"
          />
          <ScrollArea className="h-56 rounded-md border border-border/60">
            <div className="flex flex-wrap gap-1.5 p-2">
              {visible.length === 0 ? (
                <p className="px-1 py-2 text-[12px] text-muted-foreground">No handles match that filter.</p>
              ) : (
                visible.map((item) => (
                  <Badge key={item.handle} variant={item.custom ? "default" : "outline"} className="gap-1 pr-1">
                    @{item.handle}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-foreground/10"
                      aria-label={`Remove @${item.handle}`}
                      disabled={busy}
                      onClick={() => void save({ remove: item.handle })}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </section>
  );
}
