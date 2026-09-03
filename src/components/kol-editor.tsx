"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HandleTable, type HandleTableItem } from "@/components/handle-table";
import type { DeskMode } from "@/lib/desk-mode";
import type { KolSource } from "@/lib/kol";

type KolItem = {
  handle: string;
  custom: boolean;
  source: KolSource;
  active: boolean;
  followers: number | null;
  profileUrl: string;
};

type KolSnapshot = {
  handles: string[];
  count: number;
  added: string[];
  removed: string[];
  seedCount: number;
  deskMode?: DeskMode;
  items: KolItem[];
};

export function KolEditor() {
  const [kol, setKol] = useState<KolSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/kol", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load Key Network Nodes");
    setKol((await res.json()) as KolSnapshot);
  };

  useEffect(() => {
    void load().catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load Key Network Nodes"));
    const onMode = () => {
      void load().catch(() => undefined);
    };
    window.addEventListener("signl1:desk-mode", onMode);
    return () => window.removeEventListener("signl1:desk-mode", onMode);
  }, []);

  const save = async (body: { add?: string; remove?: string; reset?: boolean }, success?: string): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch("/api/kol", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as KolSnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not update Key Network Nodes");
      setKol(data);
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Key Network Nodes");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const items: HandleTableItem[] = (kol?.items ?? []).map((item) => ({
    handle: item.handle,
    source: item.source,
    active: item.active,
    followers: item.followers,
    profileUrl: item.profileUrl,
  }));

  return (
    <HandleTable
      title="Key Network Nodes"
      loading={!kol}
      loadingLabel="Loading Key Network Nodes…"
      description={
        kol ? (
          <>
            Seeded with {kol.seedCount}{" "}
            {kol.deskMode === "venture"
              ? "venture, startup, and tech-news"
              : kol.deskMode === "both"
                ? "markets and venture"
                : "markets-desk"}{" "}
            handles. These accounts skip the like floor and get a desk bump unless Require likes is on. Click a handle
            to open the X profile. Follower counts come from posts Signl1 has already ingested — accounts with no match
            yet show —. Switching desk mode on Desk tape swaps this seed.
          </>
        ) : null
      }
      items={items}
      busy={busy}
      addAriaLabel="Add Key Network Node handle"
      onAdd={(raw) => save({ add: raw }, `@${raw.replace(/^@/, "").trim()} added`)}
      onRemove={(handle) => void save({ remove: handle }, `@${handle} removed`)}
      onRestore={(handle) => void save({ add: handle }, `@${handle} restored`)}
      onReset={() => void save({ reset: true }, "Key Network Nodes reset")}
    />
  );
}
