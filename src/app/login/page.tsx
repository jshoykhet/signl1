import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";
import { isDevLoginEnabled, isGoogleAuthConfigured, isPublicSignup } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.email) redirect("/");

  const params = await searchParams;
  const callbackUrl =
    typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/") && !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/";

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/signal1-logo-256.png"
            alt="Signal1"
            width={72}
            height={72}
            className="size-[72px] rounded-[22px] shadow-lg ring-1 ring-amber-400/25"
          />
          <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.022em]">
            Signal1: Filter Signal from the Timeline
          </h1>
          <p className="mt-2 text-[15px] leading-snug text-muted-foreground">
            Build your own custom X timeline that sends regular WhatsApp updates direct to you.
          </p>
        </div>
        <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border">
          <p className="mb-5 text-[15px] leading-snug text-muted-foreground">
            {isPublicSignup()
              ? "Continue with Google to open your own inbox, rules, and watchlist. Other accounts on this host cannot see your tape."
              : "Access is invite-only. Ask an admin to add your Google account, then continue here."}
          </p>
          <LoginForm
            googleConfigured={isGoogleAuthConfigured()}
            devLogin={isDevLoginEnabled()}
            callbackUrl={callbackUrl}
            errorCode={params.error ?? null}
            publicSignup={isPublicSignup()}
          />
        </div>
      </div>
    </div>
  );
}
