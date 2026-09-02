import { signOut } from "@/auth";

export const dynamic = "force-dynamic";

/** Full-page sign-out so the session cookie is cleared server-side. */
export async function GET() {
  await signOut({ redirectTo: "/" });
}
