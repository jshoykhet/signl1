"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sameOriginCallbackPath } from "@/lib/dev-preview";
import { getFirebaseAuth } from "@/lib/firebase-client";
import type { FirebasePublicConfig } from "@/lib/firebase-config";
import { DIAL_COUNTRIES, formatPhone, normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  CredentialsSignin: "That code is wrong or expired, or this Signl1 already has another owner.",
  Configuration: "Sign-in is not configured. Set AUTH_SECRET, or add the Firebase web config.",
  AccessDenied: "This Signl1 already has an owner. Sign in with that phone number.",
  Default: "Sign-in failed. Try again.",
};

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/invalid-phone-number": "Enter a valid mobile number with country code.",
  "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/invalid-verification-code": "That code is wrong or expired.",
  "auth/code-expired": "That code expired. Send a new one.",
  "auth/missing-verification-code": "Enter the 6-digit code from the text.",
  "auth/captcha-check-failed": "The reCAPTCHA check failed. Refresh and try again.",
  "auth/operation-not-allowed": "Phone sign-in is off in the Firebase console.",
  "auth/quota-exceeded": "SMS quota is used up. Try again later.",
  "auth/missing-app-credential": "reCAPTCHA is not ready. Refresh and try again.",
};

function firebaseMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  if (code && FIREBASE_ERRORS[code]) return FIREBASE_ERRORS[code];
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message: string }).message) : "";
  if (message.length > 8 && message.length < 180) return message;
  return "Could not send or verify that code. Try again.";
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
  firebaseConfig,
  devLogin,
  callbackUrl,
  errorCode,
}: {
  firebaseConfig: FirebasePublicConfig | null;
  googleConfigured?: boolean;
  publicSignup?: boolean;
  devLogin: boolean;
  callbackUrl: string;
  errorCode: string | null;
}) {
  const [iso, setIso] = useState("US");
  const [national, setNational] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const recaptchaHost = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  const country = DIAL_COUNTRIES.find((row) => row.iso === iso) ?? DIAL_COUNTRIES[0]!;
  const error = useMemo(() => {
    const raw = localError ?? errorCode;
    if (!raw) return null;
    if (ERRORS[raw]) return ERRORS[raw];
    if (raw.length > 8 && !ERRORS[raw]) return raw;
    return ERRORS.Default;
  }, [errorCode, localError]);

  useEffect(() => {
    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, []);

  function resetVerifier() {
    try {
      verifierRef.current?.clear();
    } catch {
      /* already cleared */
    }
    verifierRef.current = null;
  }

  async function ensureVerifier() {
    if (!firebaseConfig || !recaptchaHost.current) {
      throw new Error("Phone sign-in is not ready.");
    }
    if (verifierRef.current) return verifierRef.current;
    const auth = getFirebaseAuth(firebaseConfig);
    const verifier = new RecaptchaVerifier(auth, recaptchaHost.current, { size: "invisible" });
    verifierRef.current = verifier;
    await verifier.render();
    return verifier;
  }

  async function onSendCode(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!firebaseConfig) {
      setLocalError("Phone sign-in is not configured. Add the Firebase web config.");
      return;
    }
    const nextPhone = normalizePhone(country.dial, national);
    if (!nextPhone) {
      setLocalError("Enter a valid mobile number.");
      return;
    }
    setPending(true);
    try {
      const verifier = await ensureVerifier();
      const confirmation = await signInWithPhoneNumber(getFirebaseAuth(firebaseConfig), formatPhone(nextPhone), verifier);
      confirmationRef.current = confirmation;
      setPhone(nextPhone);
      setCode("");
    } catch (err) {
      resetVerifier();
      setLocalError(firebaseMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function onVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!confirmationRef.current) return;
    setLocalError(null);
    setPending(true);
    const next = sameOriginCallbackPath(callbackUrl);
    try {
      const credential = await confirmationRef.current.confirm(code);
      const idToken = await credential.user.getIdToken();
      const result = await signIn("firebase", {
        idToken,
        callbackUrl: next,
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setLocalError(result?.error ?? "CredentialsSignin");
        setPending(false);
        return;
      }
      window.location.assign(next);
    } catch (err) {
      setLocalError(firebaseMessage(err));
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-[15px] text-destructive">{error}</div>
      ) : null}

      {!firebaseConfig && !devLogin ? (
        <p className="text-[15px] leading-snug text-muted-foreground">
          Phone sign-in is not configured. Add the Firebase web config on the server, enable the Phone provider, and
          authorize this domain.
        </p>
      ) : null}

      {firebaseConfig && !phone ? (
        <form onSubmit={(event) => void onSendCode(event)} className="space-y-4">
          <p className="text-[15px] leading-snug text-muted-foreground">
            Enter your number. We&apos;ll text a 6-digit code. Standard SMS rates apply.
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
            {pending ? "Sending…" : "Text me a code"}
          </Button>
        </form>
      ) : null}

      {firebaseConfig && phone ? (
        <form onSubmit={(event) => void onVerify(event)} className="space-y-4">
          <button
            type="button"
            className="text-[13px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => {
              setPhone(null);
              setCode("");
              setLocalError(null);
              confirmationRef.current = null;
              resetVerifier();
            }}
          >
            ← {formatPhone(phone)}
          </button>
          <p className="text-[15px] leading-snug text-muted-foreground">
            Enter the 6-digit code we texted you.
          </p>
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

      <div ref={recaptchaHost} id="recaptcha-container" />

      {devLogin ? (
        <div className="space-y-2 border-t border-border pt-4">
          <a href="/skip" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-12 w-full rounded-xl")}>
            Skip sign-in
          </a>
          <p className="text-[13px] leading-relaxed text-muted-foreground">This skip is for local preview only.</p>
        </div>
      ) : null}
    </div>
  );
}
