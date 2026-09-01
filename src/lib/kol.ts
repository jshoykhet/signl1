/**
 * Key opinion leaders whose posts skip engagement floors and get a desk
 * priority bump. Seeded from a markets-desk follow list (wires, squawk,
 * All-In, CNBC/FT talent, official desks). Extra handles come from KOL_HANDLES.
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

function parseEnvHandles(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\s,;]+/)
    .map((h) => h.replace(/^@/, "").trim())
    .filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h));
}

export function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}

export type KolEnv = {
  KOL_HANDLES?: string;
  KOL_HANDLES_MODE?: string;
};

export function loadKolHandleSet(env: KolEnv = process.env as KolEnv): Set<string> {
  const extra = parseEnvHandles(env.KOL_HANDLES);
  const mode = (env.KOL_HANDLES_MODE ?? "append").trim().toLowerCase();
  const seed = DEFAULT_KOL_HANDLES.map(normalizeHandle);
  const merged =
    mode === "replace"
      ? extra.map(normalizeHandle)
      : [...seed, ...extra.map(normalizeHandle)];
  return new Set(merged.filter(Boolean));
}

let cached: { key: string; set: Set<string> } | null = null;

function cacheKey(env: KolEnv): string {
  return `${env.KOL_HANDLES ?? ""}|${env.KOL_HANDLES_MODE ?? ""}`;
}

export function getKolHandleSet(env: KolEnv = process.env as KolEnv): Set<string> {
  const key = cacheKey(env);
  if (!cached || cached.key !== key) {
    cached = { key, set: loadKolHandleSet(env) };
  }
  return cached.set;
}

export function isKolHandle(handle: string | null | undefined, env: KolEnv = process.env as KolEnv): boolean {
  if (!handle) return false;
  return getKolHandleSet(env).has(normalizeHandle(handle));
}

export function listKolHandles(env: KolEnv = process.env as KolEnv): string[] {
  return [...getKolHandleSet(env)].sort((a, b) => a.localeCompare(b));
}

export function kolMode(env: KolEnv = process.env as KolEnv): "append" | "replace" {
  return (env.KOL_HANDLES_MODE ?? "append").trim().toLowerCase() === "replace"
    ? "replace"
    : "append";
}
