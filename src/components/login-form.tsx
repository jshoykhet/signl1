"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sameOriginCallbackPath } from "@/lib/dev-preview";
import { DIAL_COUNTRIES, formatPhone, normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

const ENTE_AUTH = "https://ente.io/auth/";
const ENTE_IOS = "https://apps.apple.com/app/ente-auth/id6444121398";
const ENTE_ANDROID = "https://play.google.com/store/apps/details?id=io.ente.auth";
const AEGIS = "https://github.com/beemdevelopment/Aegis";

type StartPayload =
  | { mode: "challenge"; phone: string }
  | { mode: "enroll"; phone: string; qrDataUrl: string; otpauthUrl: string; secret: string };

const ERRORS: Record<string, string> = {
  CredentialsSignin: "That code is wrong or expired. Try the current 6-digit code.",
  Configuration: "Sign-in is not configured. Set AUTH_SECRET, or add GOOGLE_CLIENT_SECRET for Google.",
  AccessDenied: "This Signl1 already has an owner. Sign in with that account.",
  OAuthCallback: "Google sign-in failed. Add this site to the OAuth client's authorized redirect URIs.",
  OAuthAccountNotLinked: "That Google account is not the owner of this Signl1.",
  Default: "Sign-in failed. Try again.",
};

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.4H12v4.5h6.4c-.3 1.5-1.1 2.8-2.4 3.7v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.3 7.4 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.5l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.5l4 3.1C6.3 6.8 8.9 4.7 12 4.7Z"
      />
    </svg>
  );
}

export function SkipSignInButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a href="/skip" className={className}>
      {children ?? "Skip sign-in"}
    </a>
  );
}

export function LoginForm({
  googleConfigured = false,
  devLogin,
  callbackUrl,
  errorCode,
}: {
  googleConfigured?: boolean;
  publicSignup?: boolean;
  devLogin: boolean;
  callbackUrl: string;
  errorCode: string | null;
}) {
  const [iso, setIso] = useState("US");
  const [national, setNational] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "enroll" | "challenge">("phone");
  const [start, setStart] = useState<StartPayload | null>(null);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const country = DIAL_COUNTRIES.find((row) => row.iso === iso) ?? DIAL_COUNTRIES[0]!;
  const error = useMemo(() => {
    const raw = localError ?? errorCode;
    if (!raw) return null;
    if (ERRORS[raw]) return ERRORS[raw];
    if (raw.length > 8 && !ERRORS[raw]) return raw;
    return ERRORS.Default;
  }, [errorCode, localError]);

  async function onContinue(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const phone = normalizePhone(country.dial, national);
    if (!phone) {
      setLocalError("Enter a valid mobile number.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/auth/otp/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json()) as StartPayload & { error?: string };
      if (!res.ok) {
        setLocalError(data.error ?? "Could not start sign-in.");
        return;
      }
      setStart(data);
      setStep(data.mode);
      setCode("");
    } catch {
      setLocalError("Could not connect. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!start) return;
    setLocalError(null);
    setPending(true);
    const next = sameOriginCallbackPath(callbackUrl);
    const result = await signIn("otp", {
      phone: start.phone,
      code,
      callbackUrl: next,
      redirect: false,
    });
    if (result?.error || !result?.ok) {
      setLocalError(result?.error ?? "CredentialsSignin");
      setPending(false);
      return;
    }
    window.location.assign(next);
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-[15px] text-destructive">{error}</div>
      ) : null}

      {googleConfigured && step === "phone" ? (
        <div className="space-y-4">
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 w-full rounded-xl text-[16px]"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void signIn("google", { callbackUrl: sameOriginCallbackPath(callbackUrl) });
            }}
          >
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use your phone
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      {step === "phone" ? (
        <form onSubmit={onContinue} className="space-y-4">
          <p className="text-[15px] leading-snug text-muted-foreground">
            {googleConfigured
              ? "Or enter your number for a code from your authenticator."
              : "Enter your number. We'll ask for a code from your authenticator."}
          </p>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="phone-country">
              Country
            </label>
            <select
              id="phone-country"
              value={iso}
              onChange={(event) => setIso(event.target.value)}
              className="h-12 max-w-[42%] shrink-0 rounded-xl border-0 bg-muted px-3 text-[15px] outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {DIAL_COUNTRIES.map((row) => (
                <option key={row.iso} value={row.iso}>
                  {row.name} +{row.dial}
                </option>
              ))}
            </select>
            <Input
              id="phone-number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              required
              value={national}
              onChange={(event) => setNational(event.target.value)}
              placeholder="Phone number"
              className="h-12 flex-1 rounded-xl text-[16px]"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-[16px]" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Use an open-source authenticator on your phone —{" "}
            <a href={ENTE_AUTH} className="underline underline-offset-2" target="_blank" rel="noreferrer">
              Ente Auth
            </a>{" "}
            (iOS and Android) or{" "}
            <a href={AEGIS} className="underline underline-offset-2" target="_blank" rel="noreferrer">
              Aegis
            </a>{" "}
            (Android).
          </p>
        </form>
      ) : null}

      {step !== "phone" && start ? (
        <form onSubmit={onVerify} className="space-y-4">
          <button
            type="button"
            className="text-[13px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              setStep("phone");
              setStart(null);
              setCode("");
              setLocalError(null);
            }}
          >
            ← {formatPhone(start.phone)}
          </button>

          {start.mode === "enroll" ? (
            <div className="space-y-3">
              <p className="text-[15px] leading-snug text-muted-foreground">
                Scan this with{" "}
                <a href={ENTE_AUTH} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                  Ente Auth
                </a>{" "}
                or Aegis, then enter the 6-digit code.
              </p>
              <div className="flex justify-center rounded-2xl bg-white p-4">
                <img src={start.qrDataUrl} alt="Authenticator QR code" width={200} height={200} className="size-[200px]" />
              </div>
              <p className="break-all text-center font-mono text-[12px] text-muted-foreground">{start.secret}</p>
              <div className="flex justify-center gap-3 text-[13px]">
                <a href={ENTE_IOS} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                  Ente Auth for iPhone
                </a>
                <a href={ENTE_ANDROID} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                  Android
                </a>
              </div>
            </div>
          ) : (
            <p className="text-[15px] leading-snug text-muted-foreground">
              Enter the current 6-digit code from Ente Auth or Aegis.
            </p>
          )}

          <Input
            id="phone-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="h-14 rounded-xl text-center font-mono text-[28px] tracking-[0.35em]"
          />
          <Button
            type="submit"
            size="lg"
            className="h-12 w-full rounded-xl text-[16px]"
            disabled={pending || code.length !== 6}
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : null}

      {devLogin ? (
        <div className="space-y-2 border-t border-border pt-4">
          <a href="/skip" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 w-full rounded-xl")}>
            Skip sign-in
          </a>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            This skip is for local preview only.
          </p>
        </div>
      ) : null}
    </div>
  );
}
