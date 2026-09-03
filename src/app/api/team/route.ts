import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { jsonError } from "@/lib/api";
import { getSoloAuth } from "@/lib/solo-auth";
import { formatPhone } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return jsonError("Unauthorized", 401);
  const solo = getSoloAuth();
  return NextResponse.json({
    solo: true,
    phone: solo.phone ? formatPhone(solo.phone) : null,
    confirmed: solo.confirmed,
  });
}

export async function PUT() {
  return jsonError("This desk is solo. There is no team to manage.", 410);
}
