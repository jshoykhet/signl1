export const DEFAULT_GOOGLE_CLIENT_ID =
  "103020933710-3n07noae1t93om6qq96vmoarpf14hq5f.apps.googleusercontent.com";

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** OAuth 2.0 Web client ID. Override with GOOGLE_CLIENT_ID if you rotate the client. */
export function googleClientId(): string {
  return env("GOOGLE_CLIENT_ID") || env("AUTH_GOOGLE_CLIENT_ID") || DEFAULT_GOOGLE_CLIENT_ID;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(googleClientId());
}
