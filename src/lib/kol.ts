import { parseDeskMode, type DeskMode } from "./desk-mode";
import { VENTURE_KOL_HANDLES } from "./venture-kol";

/**
 * Key Network Nodes whose posts skip engagement floors and get a desk
 * priority bump. Markets seeds wires, squawk, All-In, CNBC/FT talent, and
 * official desks. Venture seeds funds, startup reporters, and tech wires.
 * Extra handles come from KOL_HANDLES.
 *
 * KOL_HANDLES: comma, space, or newline separated; @ is optional.
 * KOL_HANDLES_MODE: append (default) unions env with the seed; replace uses only env.
 */

export const DEFAULT_KOL_HANDLES: readonly string[] = [
  // Screenshot / All-In / desks
  "zerohedge",
  "elonmusk",
  "jason",
  "friedberg",
  "chamath",
  "davidsacks",
  "jack",
  "wallstreetbets",
  "cnbc",
  "CNBC",
  "CNBCnow",
  "TheSquawk",
  "SquawkCNBC",
  "MadMoneyOnCNBC",
  "andrewrsorkin",
  "JoeSquawk",
  "BeckyQuick",
  "ScottWapnerCNBC",
  "MelissaLeeCNBC",
  "KellyEvansCNBC",
  "SaraEisen",
  "WilfredFrost",
  "CarlQuintanilla",
  "DavidFaber",
  "MorganLBrennan",
  "KateRooney",
  "KaylaTausche",
  "MegTirrell",
  "YlanMui",
  "LesliePicker",
  "EamonJavers",
  "ContessaBrewer",
  "CourtneyReagan",
  "SeemaCNBC",
  "DominicChu",
  "FrankHolland",
  "RahelSolomon",
  "TanayaMacheel",
  "JaneWells",
  "GillianTett",
  "RanaForoohar",
  "jasonfurman",
  "larrysummers",
  "paulkrugman",
  "steveliesman",
  "FT",
  "financialtimes",
  "ftalphaville",
  "ftlex",
  "ftbreakingnews",
  "WSJ",
  "WSJbusiness",
  "WSJmarkets",
  "WSJopinion",
  "WSJPolitics",
  "NYT",
  "NYTBusiness",
  "NYTpolitics",
  "Bloomberg",
  "business",
  "markets",
  "bpolitics",
  "economics",
  "technology",
  "wealth",
  "quicktake",
  "BloombergTV",
  "BloombergRadio",
  "BloombergNEF",
  "BloombergCrypto",
  "BloombergLaw",
  "MikeBloomberg",
  "reuters",
  "Reuters",
  "reutersbiz",
  "AP",
  "barronsonline",
  "Breakingviews",
  // Wires / squawk (both spellings of the tape account)
  "DeItaone",
  "deltaone",
  "FirstSquawk",
  "LiveSquawk",
  "Newsquawk",
  "unusual_whales",
  "WalterBloomberg",
  "Fxhedgers",
  // Official / venues
  "federalreserve",
  "newyorkfed",
  "USTreasury",
  "SECGov",
  "WhiteHouse",
  "Nasdaq",
  "NYSE",
  "CMEGroup",
  "CFTC",
  "IMFNews",
  "ecb",
  "bankofengland",
  "BIS_org",
];

function uniqueHandles(lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const handle of list) {
      const key = handle.replace(/^@/, "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(handle);
    }
  }
  return out;
}

export function seedKolHandles(mode: DeskMode = "markets"): readonly string[] {
  if (mode === "venture") return VENTURE_KOL_HANDLES;
  if (mode === "both") return uniqueHandles([DEFAULT_KOL_HANDLES, VENTURE_KOL_HANDLES]);
  return DEFAULT_KOL_HANDLES;
}

export function parseHandleList(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\s,;]+/)
    .map((h) => h.replace(/^@/, "").trim())
    .filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h));
}

export function serializeHandleList(handles: string[]): string {
  return [...new Set(handles.map(normalizeHandle).filter(Boolean))].sort((a, b) => a.localeCompare(b)).join("\n");
}

export function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}

export function kolProfileUrl(handle: string): string {
  const key = normalizeHandle(handle);
  return key ? `https://x.com/${key}` : "https://x.com";
}

export type KolEnv = {
  KOL_HANDLES?: string;
  KOL_HANDLES_MODE?: string;
};

export type KolPackId = "markets" | "venture";

export type KolSpec = KolEnv & {
  added?: string[];
  removed?: string[];
  deskMode?: DeskMode | string | null;
};

export function parseKolPack(raw: string | null | undefined): KolPackId {
  if (raw === "venture" || raw === "vc") return "venture";
  return "markets";
}

export function packsForDeskMode(mode: DeskMode): KolPackId[] {
  if (mode === "venture") return ["venture"];
  if (mode === "markets") return ["markets"];
  return ["markets", "venture"];
}

export function unionHandleSets(sets: Array<Iterable<string>>): Set<string> {
  const out = new Set<string>();
  for (const set of sets) {
    for (const handle of set) out.add(handle);
  }
  return out;
}

export function loadKolHandleSet(spec: KolSpec = {}): Set<string> {
  const extra = parseHandleList(spec.KOL_HANDLES);
  const added = (spec.added ?? []).map(normalizeHandle);
  const removed = new Set((spec.removed ?? []).map(normalizeHandle).filter(Boolean));
  const mode = (spec.KOL_HANDLES_MODE ?? "append").trim().toLowerCase();
  const deskMode = parseDeskMode(typeof spec.deskMode === "string" ? spec.deskMode : undefined);
  const seed = seedKolHandles(deskMode).map(normalizeHandle).filter((h) => !removed.has(h));
  const merged =
    mode === "replace"
      ? [...extra.map(normalizeHandle), ...added]
      : [...seed, ...extra.map(normalizeHandle), ...added];
  return new Set(merged.filter((h) => h && !removed.has(h)));
}

let cached: { key: string; set: Set<string> } | null = null;

function cacheKey(spec: KolSpec): string {
  return [
    spec.KOL_HANDLES ?? "",
    spec.KOL_HANDLES_MODE ?? "",
    parseDeskMode(typeof spec.deskMode === "string" ? spec.deskMode : undefined),
    (spec.added ?? []).join(","),
    (spec.removed ?? []).join(","),
  ].join("|");
}

export function getKolHandleSet(spec: KolSpec = process.env as KolSpec): Set<string> {
  const key = cacheKey(spec);
  if (!cached || cached.key !== key) {
    cached = { key, set: loadKolHandleSet(spec) };
  }
  return cached.set;
}

export function isKolHandle(handle: string | null | undefined, spec: KolSpec = process.env as KolSpec): boolean {
  if (!handle) return false;
  return getKolHandleSet(spec).has(normalizeHandle(handle));
}

export function listKolHandles(spec: KolSpec = process.env as KolSpec): string[] {
  return [...getKolHandleSet(spec)].sort((a, b) => a.localeCompare(b));
}

export type KolSource = "seed" | "added";

export type KolRow = {
  handle: string;
  source: KolSource;
  active: boolean;
};

export function isSeedOrEnvHandle(handle: string, spec: KolSpec = {}): boolean {
  const key = normalizeHandle(handle);
  if (!key) return false;
  const baseline = loadKolHandleSet({
    KOL_HANDLES: spec.KOL_HANDLES,
    KOL_HANDLES_MODE: spec.KOL_HANDLES_MODE,
    deskMode: spec.deskMode,
    added: [],
    removed: [],
  });
  return baseline.has(key);
}

export function listKolRows(spec: KolSpec = process.env as KolSpec): KolRow[] {
  const active = getKolHandleSet(spec);
  const baseline = loadKolHandleSet({
    KOL_HANDLES: spec.KOL_HANDLES,
    KOL_HANDLES_MODE: spec.KOL_HANDLES_MODE,
    deskMode: spec.deskMode,
    added: [],
    removed: [],
  });
  const rows = new Map<string, KolRow>();
  for (const handle of active) {
    rows.set(handle, {
      handle,
      source: baseline.has(handle) ? "seed" : "added",
      active: true,
    });
  }
  for (const handle of (spec.removed ?? []).map(normalizeHandle).filter(Boolean)) {
    if (rows.has(handle)) continue;
    rows.set(handle, {
      handle,
      source: baseline.has(handle) ? "seed" : "added",
      active: false,
    });
  }
  return [...rows.values()].sort((a, b) => a.handle.localeCompare(b.handle));
}

export function kolMode(env: KolEnv = process.env as KolEnv): "append" | "replace" {
  return (env.KOL_HANDLES_MODE ?? "append").trim().toLowerCase() === "replace"
    ? "replace"
    : "append";
}
