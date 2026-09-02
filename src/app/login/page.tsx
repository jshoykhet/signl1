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
          <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.022em]">Signal1</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Sign in to the shared desk</p>
        </div>
        <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border">
          <p className="mb-5 text-[15px] leading-snug text-muted-foreground">
            Every operator shares the same inbox, rules, Key Network Nodes, and WhatsApp session. Access is invite-only.
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
