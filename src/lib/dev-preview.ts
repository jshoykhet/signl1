/** Local preview account used by Skip sign-in when AUTH_DEV_LOGIN=1. */
export const DEV_PREVIEW_EMAIL = "lead@desk.com";
export const DEV_PREVIEW_NAME = "Lead";

export function isDevPreviewEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === DEV_PREVIEW_EMAIL;
}

/**
 * Keep post-login navigation on the origin the browser is already on.
 * Auth.js often returns http://localhost:3847 even when SignlHQ is opened at
 * 127.0.0.1 (or a preview host), which drops the session cookie.
 */
export function sameOriginCallbackPath(callbackUrl: string | undefined): string {
  if (typeof callbackUrl === "string" && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) {
    return callbackUrl;
  }
  return "/";
}
