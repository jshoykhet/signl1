"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SIGNAL_LEVELS, type DeskFilterSettings, type SignalLevel } from "@/lib/desk-settings";

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
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/desk", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load desk filters");
    setFilters((await res.json()) as DeskFilterSettings);
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
      setFilters((await res.json()) as DeskFilterSettings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save desk filters");
    } finally {
      setBusy(false);
    }
  };

  const floors = filters ? SIGNAL_LEVELS[filters.signalLevel] : SIGNAL_LEVELS.standard;

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
                {floors.hint}. Floors: ≥{floors.minFollowers} followers, ≥{floors.minLikes} likes, score ≥
                {floors.minScore}, desk ≥{floors.minDesk}.
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
          <Row label="Engagement">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Switch
                  checked={filters.requireEngagement}
                  disabled={busy}
                  onCheckedChange={(checked) => void save({ requireEngagement: checked === true })}
                />
                <span className="text-muted-foreground">
                  {filters.requireEngagement ? "Require likes" : "Likes optional for KOLs / fresh desks"}
                </span>
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                When on, the like and score floors apply even to KOLs and brand-new posts. Use this for confirmed tape
                instead of first-print breaking.
              </p>
            </div>
          </Row>
        </>
      )}
    </section>
  );
}
