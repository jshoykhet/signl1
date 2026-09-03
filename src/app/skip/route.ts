import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import { isDevLoginEnabled, listUsers } from "@/lib/access";
import { DEV_PREVIEW_EMAIL } from "@/lib/dev-preview";
import { isPrefetchRequest, publicOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview skip login as a normal GET (and POST) navigation.
 * A form POST never fired: Base UI buttons force type="button", and the
 * Cursor preview host often drops POSTs. /skip is a link instead.
 */
async function skipSignIn(request: Request) {
  const origin = publicOrigin(request);
  if (!isDevLoginEnabled()) {
    redirect(`${origin}/login?error=Configuration`);
  }
  const owner = listUsers()[0]?.email ?? DEV_PREVIEW_EMAIL;
  await signIn("dev", {
    email: owner,
    redirectTo: "/",
    redirect: false,
  });
  redirect(`${origin}/`);
}

export async function GET(request: Request) {
  if (isPrefetchRequest(request)) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  await skipSignIn(request);
}

export async function POST(request: Request) {
  await skipSignIn(request);
}
