import type { DeskMode } from "./desk-mode";
import type { Rule } from "./types";

/** Which X searches run for the live Focus. Markets never pulls venture monitors, and vice versa. */
export function ruleFitsFocus(rule: Pick<Rule, "mode" | "enabled" | "query">, focus: DeskMode): boolean {
  if (!rule.enabled || !rule.query.trim()) return false;
  if (focus === "both") return true;
  if (focus === "venture") return rule.mode === "vc";
  return rule.mode === "markets";
}

export function sqlFocusMode(focus: DeskMode): { sql: string; params: string[] } {
  if (focus === "both") return { sql: "", params: [] };
  if (focus === "venture") return { sql: " AND r.mode = ?", params: ["vc"] };
  return { sql: " AND r.mode = ?", params: ["markets"] };
}
