"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ENGAGEMENT_PRESETS,
  SIGNAL_LEVELS,
  effectiveMinLikes,
  parseMinLikes,
  type DeskFilterSettings,
  type SignalLevel,
} from "@/lib/desk-settings";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-2.5 text-[13px] sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DeskFilters() {
  const [filters, setFilters] = useState<DeskFilterSettings | null>(null);
  const [likesDraft, setLikesDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/desk", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load desk filters");
    const data = (await res.json()) as DeskFilterSettings;
    setFilters(data);
    setLikesDraft(data.minLikes == null ? "" : String(data.minLikes));
  };

  useEffect(() => {
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load filters"));
  }, []);

  const save = async (patch: Partial<DeskFilterSettings>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/desk", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Could not save desk filters");
      const data = (await res.json()) as DeskFilterSettings;
      setFilters(data);
      setLikesDraft(data.minLikes == null ? "" : String(data.minLikes));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save desk filters");
    } finally {
      setBusy(false);
    }
  };

  const floors = filters ? SIGNAL_LEVELS[filters.signalLevel] : SIGNAL_LEVELS.standard;
  const effective = filters ? effectiveMinLikes(filters) : floors.minLikes;

  return (
    <section className="overflow-hidden rounded-lg border border-border/80">
      <div className="border-b border-border/80 bg-muted/30 px-4 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Desk tape
      </div>
      {!filters ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">Loading filters…</div>
      ) : (
        <>
          <Row label="KOL only">
            <div className="flex items-center gap-2">
              <Switch
                checked={filters.kolOnly}
                disabled={busy}
                onCheckedChange={(checked) => void save({ kolOnly: checked === true })}
              />
              <span className="text-muted-foreground">
                {filters.kolOnly ? "Only seeded/custom KOL handles" : "All matching authors"}
              </span>
            </div>
          </Row>
          <Row label="Signal level">
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SIGNAL_LEVELS) as SignalLevel[]).map((level) => (
                  <Button
                    key={level}
                    type="button"
                    size="sm"
                    variant={filters.signalLevel === level ? "default" : "outline"}
                    disabled={busy}
                    onClick={() => void save({ signalLevel: level })}
                  >
                    {SIGNAL_LEVELS[level].label}
                  </Button>
                ))}
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {floors.hint}. Followers ≥{floors.minFollowers}, score ≥{floors.minScore}, desk ≥{floors.minDesk}.
                Likes use Min likes below.
              </p>
            </div>
          </Row>
          <Row label="Recent tweets">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Switch
                  checked={filters.allowFresh}
                  disabled={busy}
                  onCheckedChange={(checked) => void save({ allowFresh: checked === true })}
                />
                <span className="text-muted-foreground">{filters.allowFresh ? "On" : "Off"}</span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Let new posts from 10k+ accounts through before likes print (first {Math.round(floors.freshMs / 60000)}{" "}
                minutes).
              </p>
            </div>
          </Row>
          <Row label="Min likes">
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={filters.minLikes == null ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => void save({ minLikes: null })}
                >
                  Level default ({floors.minLikes})
                </Button>
                {ENGAGEMENT_PRESETS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={filters.minLikes === n ? "default" : "outline"}
                    disabled={busy}
                    onClick={() => void save({ minLikes: n })}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  value={likesDraft}
                  placeholder="Custom"
                  className="w-28 font-mono"
                  aria-label="Custom minimum likes"
                  onChange={(event) => setLikesDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const parsed = parseMinLikes(likesDraft);
                      if (parsed != null) void save({ minLikes: parsed });
                    }
                  }}
                  onBlur={() => {
                    if (likesDraft.trim() === "") return;
                    const parsed = parseMinLikes(likesDraft);
                    if (parsed != null && parsed !== filters.minLikes) void save({ minLikes: parsed });
                  }}
                />
                <span className="text-[12px] text-muted-foreground">Currently ≥{effective} likes</span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Engagement floor for the like count. Independent of signal level. 0 lets zero-like posts through if they
                still clear the other floors.
              </p>
            </div>
          </Row>
          <Row label="Require likes">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Switch
                  checked={filters.requireEngagement}
                  disabled={busy}
                  onCheckedChange={(checked) => void save({ requireEngagement: checked === true })}
                />
                <span className="text-muted-foreground">
                  {filters.requireEngagement ? "Even KOLs and fresh desks" : "KOLs / fresh desks can skip this floor"}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                When on, the min-likes and score floors apply even to KOLs and brand-new posts. Use this for confirmed
                tape instead of first-print breaking.
              </p>
            </div>
          </Row>
        </>
      )}
    </section>
  );
}
