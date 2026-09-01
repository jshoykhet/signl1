/** Baileys/WhatsApp WebSocket status codes we care about. */
export const WA_LOGGED_OUT = 401;
export const WA_RESTART_REQUIRED = 515;
export const WA_CONNECTION_CLOSED = 428;
export const WA_CONNECTION_LOST = 408;
export const WA_UNAVAILABLE = 503;

export type WhatsAppCredsSlice = {
  registered?: boolean;
  me?: { id?: string; name?: string } | null;
  account?: unknown;
};

/** pair-success writes `account` before `registered` is set on the follow-up login. */
export function hasCompletedPairHandshake(creds: WhatsAppCredsSlice): boolean {
  return Boolean(creds.registered || creds.account);
}

/**
 * requestPairingCode stamps a synthetic `me` before the phone confirms.
 * Drop it only when pair-success has not landed — otherwise the 515 restart
 * must log in with that identity.
 */
export function shouldDropSyntheticMe(creds: WhatsAppCredsSlice): boolean {
  return Boolean(creds.me) && !hasCompletedPairHandshake(creds);
}

export function isTransientWhatsAppDisconnect(statusCode: number | undefined): boolean {
  return (
    statusCode === WA_RESTART_REQUIRED ||
    statusCode === WA_CONNECTION_CLOSED ||
    statusCode === WA_CONNECTION_LOST ||
    statusCode === WA_UNAVAILABLE
  );
}

/** Hide expected WhatsApp restart noise from Settings. */
export function userFacingWhatsAppError(message: string | null | undefined): string | null {
  if (!message?.trim()) return null;
  if (/stream errored|restart required/i.test(message)) return null;
  return message;
}
