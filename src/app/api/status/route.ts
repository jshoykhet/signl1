import { NextResponse } from "next/server";
import { isDemoMode, xBearerToken } from "@/lib/config";
import { getStatus } from "@/lib/db";
import { isGrokConfigured } from "@/lib/grok";
import { isGoogleAuthConfigured } from "@/lib/access";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  return NextResponse.json({
    ...getStatus(desk.userId, {
      demoMode: isDemoMode(),
      bearerPresent: xBearerToken() !== null,
      grokPresent: isGrokConfigured(),
    }),
    googleAuth: isGoogleAuthConfigured() ? "present" : "missing",
  });
}
