import {
  kolProfileUrl,
  normalizeHandle,
  parseHandleList,
  serializeHandleList,
} from "./kol";

/**
 * Accounts whose posts never land in the inbox or fire Slack/WhatsApp,
 * including Key Network Nodes. Extra handles from BLOCKED_HANDLES (env)
 * are always blocked unless removed in Settings (until the env list changes).
 */
export type BlockedSpec = {
  BLOCKED_HANDLES?: string;
  added?: string[];
  removed?: string[];
};

export type BlockedSource = "env" | "added";

export type BlockedRow = {
  handle: string;
  source: BlockedSource;
  active: boolean;
};

export function loadBlockedHandleSet(spec: BlockedSpec = {}): Set<string> {
  const extra = parseHandleList(spec.BLOCKED_HANDLES);
  const added = (spec.added ?? []).map(normalizeHandle);
  const removed = new Set((spec.removed ?? []).map(normalizeHandle).filter(Boolean));
  return new Set([...extra, ...added].map(normalizeHandle).filter((h) => h && !removed.has(h)));
}

export function isEnvBlockedHandle(handle: string, spec: BlockedSpec = {}): boolean {
  const key = normalizeHandle(handle);
  if (!key) return false;
  return parseHandleList(spec.BLOCKED_HANDLES).map(normalizeHandle).includes(key);
}

export function isBlockedHandle(handle: string | null | undefined, spec: BlockedSpec = {}): boolean {
  if (!handle) return false;
  return loadBlockedHandleSet(spec).has(normalizeHandle(handle));
}

export function listBlockedHandles(spec: BlockedSpec = {}): string[] {
  return [...loadBlockedHandleSet(spec)].sort((a, b) => a.localeCompare(b));
}

export function listBlockedRows(spec: BlockedSpec = {}): BlockedRow[] {
  const active = loadBlockedHandleSet(spec);
  const env = new Set(parseHandleList(spec.BLOCKED_HANDLES).map(normalizeHandle));
  const rows = new Map<string, BlockedRow>();
  for (const handle of active) {
    rows.set(handle, {
      handle,
      source: env.has(handle) ? "env" : "added",
      active: true,
    });
  }
  for (const handle of (spec.removed ?? []).map(normalizeHandle).filter(Boolean)) {
    if (rows.has(handle)) continue;
    rows.set(handle, {
      handle,
      source: env.has(handle) ? "env" : "added",
      active: false,
    });
  }
  return [...rows.values()].sort((a, b) => a.handle.localeCompare(b.handle));
}

export { kolProfileUrl as blockedProfileUrl, serializeHandleList };
