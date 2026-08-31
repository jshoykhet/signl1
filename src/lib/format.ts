export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const delta = Date.now() - then;
  const abs = Math.abs(delta);
  const suffix = delta >= 0 ? "ago" : "from now";
  const sec = Math.round(abs / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ${suffix}`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ${suffix}`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ${suffix}`;
  const day = Math.round(hr / 24);
  return `${day}d ${suffix}`;
}

export function formatInterval(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const min = ms / 60_000;
  if (Number.isInteger(min)) return `${min}m`;
  return `${(ms / 1000).toFixed(0)}s`;
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
