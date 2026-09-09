import { createHash } from "node:crypto";

/** Stable short hash so identical compiled X queries share one tape hit. */
export function queryHash(query: string): string {
  return createHash("sha256").update(query.trim()).digest("hex").slice(0, 32);
}
