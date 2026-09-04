export type DeskMode = "markets" | "both" | "venture";

export const DESK_MODES: Record<
  DeskMode,
  { id: DeskMode; label: string; shortLabel: string; hint: string }
> = {
  markets: {
    id: "markets",
    label: "Markets",
    shortLabel: "Markets",
    hint: "Rates, earnings, policy, and what moves public markets.",
  },
  both: {
    id: "both",
    label: "Both",
    shortLabel: "Markets & Venture",
    hint: "Markets and venture together. Key Accounts uses both lists.",
  },
  venture: {
    id: "venture",
    label: "Venture",
    shortLabel: "Venture",
    hint: "Funding, launches, and the people building companies.",
  },
};

export function parseDeskMode(raw: string | null | undefined): DeskMode {
  if (raw === "both") return "both";
  if (raw === "venture" || raw === "vc") return "venture";
  return "markets";
}

export function includesMarketsTape(mode: DeskMode): boolean {
  return mode === "markets" || mode === "both";
}

export function includesVentureTape(mode: DeskMode): boolean {
  return mode === "venture" || mode === "both";
}

export function signalLevelHint(
  level: "low" | "standard" | "high",
  mode: DeskMode,
): string {
  if (mode === "both") {
    if (level === "low") return "More posts. Still needs news, funding, a launch, or a real point of view.";
    if (level === "high") return "Fewer posts. Sourced news, priced rounds, and real analysis.";
    return "News, funding, and launches. Not ticker chatter or lifestyle.";
  }
  if (mode === "venture") {
    if (level === "low") return "More posts. Still needs funding, a launch, or a deal.";
    if (level === "high") return "Fewer posts. Priced rounds, acquisitions, and sourced announcements.";
    return "Funding, launches, and scoops. Not lifestyle.";
  }
  if (level === "low") return "More posts. Still needs news or a real point of view.";
  if (level === "high") return "Fewer posts. Sourced news and real analysis.";
  return "News, numbers, and sourced takes. Not ticker chatter.";
}
