export type DeskMode = "markets" | "both" | "venture";

export const DESK_MODES: Record<
  DeskMode,
  { id: DeskMode; label: string; shortLabel: string; hint: string }
> = {
  markets: {
    id: "markets",
    label: "Markets",
    shortLabel: "Markets desk",
    hint: "FOMC, earnings, flow, and policy — for traders and public-markets research.",
  },
  both: {
    id: "both",
    label: "Both",
    shortLabel: "Both desks",
    hint: "Markets prints and venture announcements — Key Accounts uses both lists. Edit them on the Accounts tab.",
  },
  venture: {
    id: "venture",
    label: "Venture",
    shortLabel: "Venture desk",
    hint: "Funding, launches, and tech announcements — for VCs and startup sourcing.",
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
    if (level === "low") return "More tape, still needs a news, funding, launch, or analytical hook";
    if (level === "high") return "Less tape — sourced news, priced rounds, and real analysis";
    return "Wires, prints, funding, and launches — not cashtag chatter or founder lifestyle";
  }
  if (mode === "venture") {
    if (level === "low") return "More tape, still needs a funding, launch, or deal hook";
    if (level === "high") return "Less tape — priced rounds, M&A, and sourced announcements";
    return "Funding rounds, launches, and scoops — not founder lifestyle";
  }
  if (level === "low") return "More tape, still needs a news hook or an analytical take";
  if (level === "high") return "Less tape — sourced news, sized prints, and real analysis";
  return "Wires, prints vs expected, and sourced takes — not cashtag chatter";
}
