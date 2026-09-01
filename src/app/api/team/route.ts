import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { jsonError } from "@/lib/api";
import {
  addAllowedEmail,
  getTeamSnapshot,
  isDevLoginEnabled,
  isGoogleAuthConfigured,
  removeAllowedEmail,
} from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return jsonError("Unauthorized", 401);
  return NextResponse.json({
    me: {
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
      role: session.user.role,
    },
    googleConfigured: isGoogleAuthConfigured(),
    devLogin: isDevLoginEnabled(),
    ...getTeamSnapshot(),
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return jsonError("Unauthorized", 401);
  if (session.user.role !== "admin") return jsonError("Only admins can change the team.", 403);

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
      addAllowedEmail(email, session.user.email);
    } else if (action === "revoke") {
      removeAllowedEmail(email);
    } else {
      return jsonError("Unknown action. Use invite or revoke.");
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Team update failed");
  }

  return NextResponse.json({
    me: {
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
      role: session.user.role,
    },
    googleConfigured: isGoogleAuthConfigured(),
    devLogin: isDevLoginEnabled(),
    ...getTeamSnapshot(),
  });
}
