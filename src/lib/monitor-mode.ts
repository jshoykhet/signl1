export type MonitorMode = "markets" | "vc";

export const MONITOR_MODES: Record<
  MonitorMode,
  { id: MonitorMode; label: string; hint: string }
> = {
  markets: {
    id: "markets",
    label: "Markets",
    hint: "Watchlist names, the Fed, oil, and the numbers that move markets.",
  },
  vc: {
    id: "vc",
    label: "VC",
    hint: "People, financings, and product activity in startups and technology.",
  },
};

export const MARKETS_DEFAULT_NAMES = ["Watchlist", "Fed", "Oil", "Macro"] as const;
export const VC_DEFAULT_NAMES = ["Tech Leaders", "Funding Announcements", "Product Launches"] as const;

export function parseMonitorMode(raw: string | null | undefined): MonitorMode {
  if (raw === "vc" || raw === "venture") return "vc";
  return "markets";
}

export function monitorModeFromDeskMode(deskMode: string | null | undefined): MonitorMode {
  return deskMode === "venture" || deskMode === "vc" ? "vc" : "markets";
}
