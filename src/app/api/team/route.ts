import { NextResponse } from "next/server";
import { listUsers } from "@/lib/access";
import { jsonError } from "@/lib/api";
import { requireDeskUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk.response;
  const people = listUsers()
    .filter((user) => !user.disabled)
    .map((user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      you: user.id === desk.userId,
    }));
  return NextResponse.json({
    solo: people.length <= 1,
    email: desk.email,
    role: desk.role,
    people,
  });
}

export async function PUT() {
  return jsonError("Invite people by signing in with Google, or set AUTH_ALLOWED_EMAILS.", 410);
}
