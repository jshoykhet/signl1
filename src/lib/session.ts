import { auth } from "@/auth";
import { jsonError } from "./api";

export async function requireDeskUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false as const, response: jsonError("Unauthorized", 401) };
  }
  return {
    ok: true as const,
    userId,
    role: session.user.role,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    image: session.user.image ?? null,
  };
}

export async function requireAdmin() {
  const desk = await requireDeskUser();
  if (!desk.ok) return desk;
  if (desk.role !== "admin") {
    return { ok: false as const, response: jsonError("Only the instance admin can open Analytics.", 403) };
  }
  return desk;
}
