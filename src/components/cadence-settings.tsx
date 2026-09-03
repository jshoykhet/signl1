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
      toast.success(`${cadenceLabel(next)} — inbox and WhatsApp`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save interval");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsGroup
      title="Inbox & WhatsApp"
      footer="Signl1 polls X on this schedule and WhatsApp sends the top 20 matches from that window. Live X bills about $0.005 per post returned and $0.010 per author — shorter intervals cost more. Identical queries are shared across desks. Re-poll still runs now."
    >
      <GroupedRow className="items-start sm:items-center">
        <div className="w-full shrink-0 text-[15px] text-muted-foreground sm:w-[9.5rem]">Interval</div>
        <div className="min-w-0 flex-1">
          {minutes == null ? (
            <div className="text-[15px] text-muted-foreground">Loading…</div>
          ) : (
            <Select
              value={String(minutes)}
              onValueChange={(value) => void save(Number(value))}
              disabled={busy}
            >
              <SelectTrigger className="min-w-56" size="sm">
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
