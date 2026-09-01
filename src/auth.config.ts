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

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/api/auth");
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
      if (auth?.user) return true;
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return false;
    },
  },
} satisfies NextAuthConfig;
