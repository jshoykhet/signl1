import { LoginForm } from "@/components/login-form";

export function MarketingHome({
  googleConfigured,
  devLogin,
  errorCode,
  publicSignup,
}: {
  googleConfigured: boolean;
  devLogin: boolean;
  errorCode: string | null;
  publicSignup: boolean;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img
            src="/signal1-logo-256.png"
            alt="Signal1"
            width={36}
            height={36}
            className="size-9 rounded-xl ring-1 ring-amber-400/25"
          />
          <span className="text-[17px] font-semibold tracking-[-0.02em]">Signal1</span>
        </div>
        <a
          href="#start"
          className="rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background"
        >
          Get your desk
        </a>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-16 pt-6 md:pt-16">
        <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
              X alerts for research operators
            </p>
            <h1 className="mt-3 max-w-xl text-[40px] leading-[1.08] font-semibold tracking-[-0.035em] md:text-[52px]">
              Your own tape. Not a shared inbox.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
              {publicSignup
                ? "Sign in with Google. Signal1 gives you a private desk: watch rules, a cashtag watchlist, and WhatsApp or Slack when something hits. Other people on this host cannot see your matches."
                : "This host is invite-only. If an admin added your Google account, sign in below to open your private desk."}
            </p>
            <ul className="mt-8 grid gap-3 text-[15px] text-muted-foreground sm:grid-cols-2">
              <li className="rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                Official X recent-search, not scraping.
              </li>
              <li className="rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                Seeded Markets or Venture rules you can edit.
              </li>
              <li className="rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                Engagement floors, Key Network Nodes, blocked handles.
              </li>
              <li className="rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                WhatsApp alerts to the number you save.
              </li>
            </ul>
          </div>

          <div id="start" className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em]">
              {publicSignup ? "Create your desk" : "Sign in"}
            </h2>
            <p className="mt-1.5 mb-5 text-[15px] leading-snug text-muted-foreground">
              {publicSignup
                ? "Google sign-in is enough. No invite code. Your inbox stays private to this account."
                : "Use the Google account an admin invited on Settings → Access."}
            </p>
            <LoginForm
              googleConfigured={googleConfigured}
              devLogin={devLogin}
              callbackUrl="/"
              errorCode={errorCode}
              publicSignup={publicSignup}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
