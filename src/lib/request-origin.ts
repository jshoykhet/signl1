/** Origin the browser is actually on (preview host, not AUTH_URL / localhost). */
export function publicOrigin(request: Request): string {
  const forwardedHost = (request.headers.get("x-forwarded-host") ?? "").split(",")[0]?.trim() ?? "";
  const host = (forwardedHost || request.headers.get("host") || "").split(",")[0]?.trim() ?? "";
  const forwardedProto = (request.headers.get("x-forwarded-proto") ?? "").split(",")[0]?.trim() ?? "";
  const local = isLoopbackHost(host);
  const proto = forwardedProto || (local ? "http" : "https");
  if (host && !local) return `${proto}://${host}`;
  const authUrl = process.env.AUTH_URL?.trim();
  if (authUrl) return authUrl.replace(/\/$/, "");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export function isLoopbackHost(host: string): boolean {
  const value = host.toLowerCase();
  return (
    !value ||
    value.startsWith("localhost") ||
    value.startsWith("127.0.0.1") ||
    value.startsWith("0.0.0.0") ||
    value.startsWith("[::1]")
  );
}

export function isPrefetchRequest(request: Request): boolean {
  const purpose = `${request.headers.get("purpose") ?? ""} ${request.headers.get("sec-purpose") ?? ""}`.toLowerCase();
  return purpose.includes("prefetch") || purpose.includes("prerender");
}
