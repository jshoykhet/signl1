"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { signIn } from "next-auth/react";
import { buttonVariants } from "@/components/ui/button";
import { sameOriginCallbackPath } from "@/lib/dev-preview";
import { cn } from "@/lib/utils";

const ERRORS: Record<string, string> = {
  CredentialsSignin: "Google could not verify that account, or it is not on the allowlist.",
  Configuration: "Sign-in is not configured. Set AUTH_SECRET, or check the Google client ID.",
  AccessDenied: "That Google account is not allowed to open a SignlHQ on this Signl1.",
  Default: "Sign-in failed. Try again.",
};

type GoogleId = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup" | "use";
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ) => void;
};

function googleId(): GoogleId | undefined {
  const google = (window as unknown as { google?: { accounts?: { id?: GoogleId } } }).google;
  return google?.accounts?.id;
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
  googleClientId,
  googleConfigured,
  devLogin,
  callbackUrl,
  errorCode,
}: {
  googleClientId: string;
  googleConfigured?: boolean;
  publicSignup?: boolean;
  devLogin: boolean;
  callbackUrl: string;
  errorCode: string | null;
}) {
  const configured = googleConfigured ?? Boolean(googleClientId);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const buttonHost = useRef<HTMLDivElement>(null);
  const callbackUrlRef = useRef(callbackUrl);
  callbackUrlRef.current = callbackUrl;

  const error = useMemo(() => {
    const raw = localError ?? errorCode;
    if (!raw) return null;
    if (ERRORS[raw]) return ERRORS[raw];
    if (raw.length > 8 && !ERRORS[raw]) return raw;
    return ERRORS.Default;
  }, [errorCode, localError]);

  const onCredential = useCallback(async (credential: string) => {
    setLocalError(null);
    setPending(true);
    const next = sameOriginCallbackPath(callbackUrlRef.current);
    try {
      const result = await signIn("google", {
        idToken: credential,
        callbackUrl: next,
        redirect: false,
      });
      if (result?.error || !result?.ok) {
        setLocalError(result?.error ?? "CredentialsSignin");
        setPending(false);
        return;
      }
      window.location.assign(next);
    } catch {
      setLocalError("Default");
      setPending(false);
    }
  }, []);

  const renderButton = useCallback(() => {
    const id = googleId();
    const host = buttonHost.current;
    if (!id || !host || !googleClientId) return;
    host.innerHTML = "";
    id.initialize({
      client_id: googleClientId,
      callback: (response) => {
        if (!response.credential) {
          setLocalError("Google did not return an email. Try again.");
          return;
        }
        void onCredential(response.credential);
      },
      ux_mode: "popup",
      auto_select: false,
      cancel_on_tap_outside: true,
      context: "signin",
    });
    const width = Math.min(400, Math.max(240, host.clientWidth || 320));
    id.renderButton(host, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width,
      logo_alignment: "left",
    });
  }, [googleClientId, onCredential]);

  useEffect(() => {
    if (!scriptReady) return;
    renderButton();
    const onResize = () => renderButton();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderButton, scriptReady]);

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-[15px] text-destructive">{error}</div>
      ) : null}

      {!configured && !devLogin ? (
        <p className="text-[15px] leading-snug text-muted-foreground">
          Google sign-in is not configured. Set <span className="font-medium text-foreground">GOOGLE_CLIENT_ID</span>{" "}
          on the server and add this origin under Authorized JavaScript origins.
        </p>
      ) : null}

      {configured ? (
        <div className="space-y-3">
          <p className="text-[15px] leading-snug text-muted-foreground">
            Sign in with Google. Each account gets its own SignlHQ — filters, rules, and inbox stay separate.
          </p>
          <div className={cn("min-h-11", pending && "pointer-events-none opacity-60")}>
            <div ref={buttonHost} className="flex min-h-11 justify-center [&>div]:w-full" />
          </div>
          {pending ? <p className="text-[13px] text-muted-foreground">Signing in…</p> : null}
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="afterInteractive"
            onLoad={() => setScriptReady(true)}
          />
        </div>
      ) : null}

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
