import { NextResponse } from "next/server";
import { isDemoMode, xBearerToken } from "@/lib/config";
import { getStatus } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getStatus({ demoMode: isDemoMode(), bearerPresent: xBearerToken() !== null }));
}
