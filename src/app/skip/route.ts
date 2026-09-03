import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { isDevLoginEnabled } from "@/lib/access";
import { DEV_PREVIEW_EMAIL } from "@/lib/dev-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview-only skip login. Uses Auth.js server signIn, which skips the CSRF
 * cookie the client fetch cannot set on the Cursor preview host
 * (*.agent.cvm.dev) when AUTH_URL is http://127.0.0.1:3847.
 */
async function skipSignIn() {
  if (!isDevLoginEnabled()) {
    redirect("/login?error=Configuration");
  }
  await signIn("dev", {
    email: DEV_PREVIEW_EMAIL,
    redirectTo: "/",
    redirect: false,
  });
  redirect("/");
}

export async function POST() {
  await skipSignIn();
}
