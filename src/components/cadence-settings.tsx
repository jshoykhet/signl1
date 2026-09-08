"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GroupedRow, SettingsGroup } from "@/components/grouped-list";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cadenceLabel, DIGEST_INTERVALS } from "@/lib/desk-settings";

export function CadenceSettings() {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load interval");
    const data = (await res.json()) as { cadenceMinutes?: number };
    setMinutes(data.cadenceMinutes ?? 15);
  };

  useEffect(() => {
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load interval"));
  }, []);

  const save = async (next: number) => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ digestMinutes: next, alertMode: "digest" }),
      });
      if (!res.ok) throw new Error("Could not save interval");
      setMinutes(next);
      toast.success(`${cadenceLabel(next)}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save interval");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroup
      title="Updates"
      footer="Signl1 checks X on this schedule. Shorter intervals cost more on X. Re-poll still runs now."
    >
      <GroupedRow className="flex-col items-stretch sm:flex-row sm:items-center">
        <div className="w-full shrink-0 text-[13px] text-muted-foreground sm:w-[9.5rem] sm:text-[15px]">Interval</div>
        <div className="min-w-0 flex-1">
          {minutes == null ? (
            <div className="text-[15px] text-muted-foreground">Loading…</div>
          ) : (
            <Select
              value={String(minutes)}
              onValueChange={(value) => void save(Number(value))}
              disabled={busy}
            >
              <SelectTrigger className="h-12 w-full min-h-12 min-w-0 text-[16px] sm:h-8 sm:min-h-8 sm:min-w-56 sm:text-[13px]" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIGEST_INTERVALS.map((item) => (
                  <SelectItem key={item.minutes} value={String(item.minutes)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </GroupedRow>
    </SettingsGroup>
  );
}
