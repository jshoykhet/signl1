import { LoginForm, SkipSignInButton } from "@/components/login-form";
import { isDevLoginEnabled } from "@/lib/access";

export function MarketingHome({
  errorCode,
}: {
  googleConfigured?: boolean;
  devLogin?: boolean;
  errorCode: string | null;
  publicSignup?: boolean;
}) {
  const devLogin = isDevLoginEnabled();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img
            src="/signl1-logo-256.png"
            alt="Signl1"
            width={36}
            height={36}
            className="size-9 rounded-xl ring-1 ring-amber-400/25"
          />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Signl1</span>
        </div>
        {devLogin ? (
          <SkipSignInButton className="rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background">
            Skip sign-in
          </SkipSignInButton>
        ) : (
          <a href="#start" className="rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background">
            Sign in
          </a>
        )}
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-16 pt-6 md:pt-16">
        <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h1 className="max-w-xl text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] md:text-[52px]">
              What matters on the Timeline
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
              WhatsApp alerts so you never miss anything. Signl1 ranks the tape, surfaces themes, and lets you ask Grok
              to research X.
            </p>
          </div>

          <div id="start" className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">Sign in</h2>
            <div className="mt-5">
              <LoginForm devLogin={devLogin} callbackUrl="/" errorCode={errorCode} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
