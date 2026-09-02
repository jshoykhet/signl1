import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { jsonError } from "@/lib/api";
import {
  addAllowedEmail,
  getTeamSnapshot,
  isDevLoginEnabled,
  isGoogleAuthConfigured,
  isPublicSignup,
  removeAllowedEmail,
  setUserDisabled,
} from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function payload(session: {
  user: { email?: string | null; name?: string | null; image?: string | null; role?: string };
}) {
  return {
    me: {
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
      role: session.user.role,
    },
    googleConfigured: isGoogleAuthConfigured(),
    devLogin: isDevLoginEnabled(),
    publicSignup: isPublicSignup(),
    ...getTeamSnapshot(),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return jsonError("Unauthorized", 401);
  return NextResponse.json(payload(session));
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return jsonError("Unauthorized", 401);
  if (session.user.role !== "admin") return jsonError("Only admins can change access.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected JSON object");
  }
  if (!body || typeof body !== "object") return jsonError("Expected JSON object");
  const raw = body as { action?: unknown; email?: unknown };
  const action = String(raw.action ?? "");
  const email = String(raw.email ?? "");

  try {
    if (action === "invite") {
      if (isPublicSignup()) {
        setUserDisabled(email, false);
      } else {
        addAllowedEmail(email, session.user.email);
      }
    } else if (action === "revoke") {
      if (isPublicSignup()) {
        setUserDisabled(email, true);
      } else {
        removeAllowedEmail(email);
      }
    } else {
      return jsonError("Unknown action. Use invite or revoke.");
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Team update failed");
  }

  return NextResponse.json(payload(session));
}
