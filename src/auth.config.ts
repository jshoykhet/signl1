import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

export function resolveAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
  if (process.env.NODE_ENV !== "production" || isBuild) {
    return "signal1-dev-secret-not-for-production";
  }
  throw new Error("AUTH_SECRET is required in production. Generate one with: openssl rand -base64 32");
}

function requestOrigin(request: { nextUrl: URL; headers: Headers }): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  if (!host || host.startsWith("localhost")) {
    const authUrl = process.env.AUTH_URL?.trim();
    if (authUrl) return authUrl.replace(/\/$/, "");
  }
  const proto = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", ""))
    .split(",")[0]
    .trim();
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

function isPublicPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" || pathname.startsWith("/api/auth");
}

/** Edge session has email/name from the JWT; custom `user.id` is only filled in Node. */
function hasSessionUser(auth: { user?: { email?: string | null } | null } | null): boolean {
  return Boolean(auth?.user?.email);
}

/**
 * Edge/proxy-safe config. Do not import SQLite or Node-only modules here.
 * Providers and DB callbacks live in `src/auth.ts`.
 */
export const authConfig = {
  trustHost: true,
  secret: resolveAuthSecret(),
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (isPublicPath(pathname)) return true;
      if (hasSessionUser(auth)) return true;
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const login = new URL("/login", requestOrigin(request));
      const callback = `${pathname}${request.nextUrl.search}`;
      if (callback && callback !== "/") login.searchParams.set("callbackUrl", callback);
      return NextResponse.redirect(login);
    },
  },
} satisfies NextAuthConfig;
