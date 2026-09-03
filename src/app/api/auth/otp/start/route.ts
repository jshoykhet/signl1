import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { jsonError } from "@/lib/api";
import { startSoloOtp } from "@/lib/solo-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected JSON object");
  }
  const phone = typeof body === "object" && body && "phone" in body ? String((body as { phone?: unknown }).phone ?? "") : "";
  const result = startSoloOtp(phone);
  if (!result.ok) return jsonError(result.error, 400);
  if (result.mode === "challenge") {
    return NextResponse.json({ mode: "challenge", phone: result.phone });
  }
  const qrDataUrl = await QRCode.toDataURL(result.otpauthUrl, {
    margin: 1,
    width: 240,
    color: { dark: "#111111", light: "#ffffff" },
  });
  return NextResponse.json({
    mode: "enroll",
    phone: result.phone,
    qrDataUrl,
    otpauthUrl: result.otpauthUrl,
    secret: result.secret,
  });
}
