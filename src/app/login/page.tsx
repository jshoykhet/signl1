import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { isDevLoginEnabled, isGoogleAuthConfigured } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/") && !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/";

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/signal1-logo-256.png"
            alt="Signal1"
            width={40}
            height={40}
            className="size-10 rounded-md ring-1 ring-amber-500/30"
          />
          <div>
            <div className="font-heading text-lg font-semibold tracking-wide">Signal1</div>
            <div className="text-xs text-muted-foreground">Shared markets desk · Google sign-in</div>
          </div>
        </div>
        <div className="rounded-xl border border-border/80 bg-card/40 p-5 shadow-sm">
          <h1 className="text-sm font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-muted-foreground">
            Every operator shares the same inbox, rules, KOL list, and WhatsApp session. Access is invite-only —
            your Google account must be on the desk allowlist.
          </p>
          <LoginForm
            googleConfigured={isGoogleAuthConfigured()}
            devLogin={isDevLoginEnabled()}
            callbackUrl={callbackUrl}
            errorCode={params.error ?? null}
          />
        </div>
      </div>
    </div>
  );
}
