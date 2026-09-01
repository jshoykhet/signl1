"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERRORS: Record<string, string> = {
  AccessDenied:
    "That Google account is not on this desk. Ask an admin to invite the email on Settings → Team.",
  Configuration: "Sign-in is not configured. Set AUTH_SECRET and a Google OAuth client, or enable AUTH_DEV_LOGIN=1 locally.",
  Verification: "That sign-in link is invalid or expired. Try again.",
  OAuthSignin: "Google did not start the sign-in. Check GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.",
  OAuthCallback: "Google redirected back with an error. Confirm the authorized redirect URI is https://<domain>/api/auth/callback/google.",
  Callback: "Sign-in callback failed. Confirm AUTH_URL matches the URL in the browser.",
  CredentialsSignin: "That email is not on the invite list.",
  Default: "Sign-in failed. Try again or ask an admin to invite your Google account.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.82-.07-1.64-.23-2.43H12v4.6h6.46a5.52 5.52 0 0 1-2.4 3.63v3h3.87c2.26-2.08 3.56-5.15 3.56-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.97-1.07 7.96-2.93l-3.87-3c-1.08.74-2.47 1.16-4.09 1.16-3.14 0-5.8-2.12-6.75-4.97H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.26A7.2 7.2 0 0 1 4.87 12c0-.79.14-1.55.38-2.26V6.65H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.35l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.96 1.14 15.23 0 12 0 7.31 0 3.26 2.69 1.27 6.65l3.98 3.09C6.2 6.87 8.86 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function LoginForm({
  googleConfigured,
  devLogin,
  callbackUrl,
  errorCode,
}: {
  googleConfigured: boolean;
  devLogin: boolean;
  callbackUrl: string;
  errorCode: string | null;
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<"google" | "dev" | null>(null);
  const error = useMemo(() => {
    if (!errorCode) return null;
    return ERRORS[errorCode] ?? ERRORS.Default;
  }, [errorCode]);

  const hasAny = googleConfigured || devLogin;

  async function onGoogle() {
    setPending("google");
    await signIn("google", { callbackUrl });
  }

  async function onDev(event: React.FormEvent) {
    event.preventDefault();
    setPending("dev");
    await signIn("dev", { email, callbackUrl });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!hasAny ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/80">
          No sign-in provider is enabled. Add a Google OAuth client, or set{" "}
          <code className="font-mono text-[12px]">AUTH_DEV_LOGIN=1</code> for a local desk email.
        </div>
      ) : null}

      {googleConfigured ? (
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full gap-2"
          onClick={onGoogle}
          disabled={pending !== null}
        >
          <GoogleMark />
          {pending === "google" ? "Redirecting to Google…" : "Continue with Google"}
        </Button>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Google sign-in is off until <code className="font-mono">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono">GOOGLE_CLIENT_SECRET</code> are set. Production should use Google only —
          see <span className="font-medium text-foreground">DEPLOY.md</span>.
        </p>
      )}

      {googleConfigured && devLogin ? (
        <div className="flex items-center gap-3 text-[11px] tracking-wider text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          or local desk
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      {devLogin ? (
        <form onSubmit={onDev} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="desk-email">Desk email</Label>
            <Input
              id="desk-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@desk.com"
            />
          </div>
          <Button type="submit" className="h-9 w-full" disabled={pending !== null}>
            {pending === "dev" ? "Signing in…" : "Sign in with email"}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Local fallback only. The production Compose file sets{" "}
            <code className="font-mono">AUTH_DEV_LOGIN=0</code> so operators must use Google.
          </p>
        </form>
      ) : null}
    </div>
  );
}
