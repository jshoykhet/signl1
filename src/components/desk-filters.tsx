"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_MIN_LIKES,
  MIN_LIKES_SLIDER_MAX,
  SIGNAL_LEVELS,
  parseMinLikes,
  type DeskFilterSettings,
  type SignalLevel,
} from "@/lib/desk-settings";
import { signalLevelHint, type DeskMode } from "@/lib/desk-mode";
import { FocusControl } from "@/components/focus-control";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <GroupedRow className="items-start sm:items-center">
      <div className="w-full shrink-0 text-[15px] text-muted-foreground sm:w-[9.5rem]">{label}</div>
      <div className="min-w-0 flex-1 text-[15px]">{children}</div>
    </GroupedRow>
  );
}

export function DeskFilters() {
  const [filters, setFilters] = useState<DeskFilterSettings | null>(null);
  const [likesDraft, setLikesDraft] = useState(String(DEFAULT_MIN_LIKES));
  const [likesLive, setLikesLive] = useState(DEFAULT_MIN_LIKES);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/desk", { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn't load filters.");
    const data = (await res.json()) as DeskFilterSettings;
    setFilters(data);
    setLikesDraft(String(data.minLikes));
    setLikesLive(data.minLikes);
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
      if (!res.ok) throw new Error("Couldn't save filters.");
      const data = (await res.json()) as DeskFilterSettings;
      setFilters(data);
      setLikesDraft(String(data.minLikes));
      setLikesLive(data.minLikes);
      if (patch.deskMode) {
        window.dispatchEvent(new CustomEvent("signl1:desk-mode", { detail: data.deskMode }));
        const toasts: Record<DeskMode, string> = {
          markets: "Now watching markets.",
          both: "Now watching markets and venture.",
          venture: "Now watching venture.",
        };
        toast.success(toasts[data.deskMode]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save filters.");
    } finally {
      setBusy(false);
    }
  };

  const commitLikes = (raw: string | number) => {
    const parsed = parseMinLikes(raw);
    const next = parsed ?? DEFAULT_MIN_LIKES;
    setLikesLive(next);
    setLikesDraft(String(next));
    if (filters && next !== filters.minLikes) void save({ minLikes: next });
  };

  const mode = filters?.deskMode ?? "markets";
  const sliderValue = Math.min(MIN_LIKES_SLIDER_MAX, likesLive);
  const footer =
    mode === "venture"
      ? "Funding, launches, acquisitions, and sourced announcements stay in. Lifestyle and dunks stay out. Hide crypto drops memecoins, not sector news. Hide chat apps drops Telegram and WhatsApp. Posts you marked to keep still come through."
      : mode === "both"
        ? "Markets news and venture announcements stay in. Ticker chatter, lifestyle, and dunks stay out. Hide crypto drops memecoins, not listed names. Hide chat apps drops Telegram and WhatsApp. Posts you marked to keep still come through."
        : "News and analysis stay in. Ticker-only posts and dunks stay out. Hide crypto keeps listed names like $COIN. Hide chat apps drops Telegram and WhatsApp. Posts you marked to keep still come through.";

  return (
    <SettingsGroup title="Focus" footer={footer}>
      {!filters ? (
        <div className="px-4 py-3.5 text-[15px] text-muted-foreground">Loading filters…</div>
      ) : (
        <>
          <Row label="Focus">
            <FocusControl
              value={filters.deskMode}
              disabled={busy}
              onChange={(id) => void save({ deskMode: id })}
            />
          </Row>
          <Row label="Key accounts only">
            <div className="flex items-center justify-end gap-3 sm:justify-start">
              <Switch
                checked={filters.kolOnly}
                disabled={busy}
                onCheckedChange={(checked) => void save({ kolOnly: checked === true })}
              />
            </div>
          </Row>
          <Row label="Signal">
            <div className="grid gap-2">
              <div className="flex rounded-full bg-muted p-0.5">
                {(Object.keys(SIGNAL_LEVELS) as SignalLevel[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    disabled={busy}
                    onClick={() => void save({ signalLevel: level })}
                    className={
                      filters.signalLevel === level
                        ? "flex-1 rounded-full bg-background px-3 py-1.5 text-[13px] font-medium text-foreground shadow-sm"
                        : "flex-1 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground"
                    }
                  >
                    {SIGNAL_LEVELS[level].label}
                  </button>
                ))}
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {signalLevelHint(filters.signalLevel, mode)}
              </p>
            </div>
          </Row>
          <Row label="Recent tweets">
            <div className="flex items-center justify-end gap-3 sm:justify-start">
              <Switch
                checked={filters.allowFresh}
                disabled={busy}
                onCheckedChange={(checked) => void save({ allowFresh: checked === true })}
              />
            </div>
          </Row>
          <GroupedRow className="flex-col items-stretch gap-3 py-3.5 sm:flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[15px] text-muted-foreground">Min likes</div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={likesDraft}
                disabled={busy}
                aria-label="Minimum likes"
                className="h-8 w-16 rounded-lg bg-muted text-center font-medium tabular-nums"
                onChange={(event) => {
                  const raw = event.target.value.replace(/[^\d]/g, "");
                  setLikesDraft(raw);
                  const parsed = parseMinLikes(raw);
                  if (parsed != null) setLikesLive(parsed);
                }}
                onBlur={() => commitLikes(likesDraft === "" ? DEFAULT_MIN_LIKES : likesDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    (event.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>
            <Slider
              min={0}
              max={MIN_LIKES_SLIDER_MAX}
              step={1}
              disabled={busy}
              value={[sliderValue]}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                const n = typeof next === "number" ? next : DEFAULT_MIN_LIKES;
                setLikesLive(n);
                setLikesDraft(String(n));
              }}
              onValueCommitted={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                commitLikes(typeof next === "number" ? next : DEFAULT_MIN_LIKES);
              }}
              className="py-1"
            />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Default is 5. Posts below this stay out, unless they&apos;re new from a large account or from someone on
              Key Accounts.
            </p>
          </GroupedRow>
          <Row label="Require likes">
            <div className="flex items-center justify-end gap-3 sm:justify-start">
              <Switch
                checked={filters.requireEngagement}
                disabled={busy}
                onCheckedChange={(checked) => void save({ requireEngagement: checked === true })}
              />
            </div>
          </Row>
          <Row label="Hide crypto">
            <div className="flex items-center justify-end gap-3 sm:justify-start">
              <Switch
                checked={filters.hideCrypto}
                disabled={busy}
                onCheckedChange={(checked) => void save({ hideCrypto: checked === true })}
              />
            </div>
          </Row>
          <Row label="Hide chat apps">
            <div className="flex items-center justify-end gap-3 sm:justify-start">
              <Switch
                checked={filters.hideMessagingApps}
                disabled={busy}
                onCheckedChange={(checked) => void save({ hideMessagingApps: checked === true })}
              />
            </div>
          </Row>
        </>
      )}
    </SettingsGroup>
  );
}
