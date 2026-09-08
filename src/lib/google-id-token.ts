import { createRemoteJWKSet, jwtVerify } from "jose";
import { googleClientId } from "./google-auth";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdClaims = {
  email: string;
  name: string | null;
  picture: string | null;
};

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdClaims | null> {
  const audience = googleClientId();
  const token = idToken.trim();
  if (!audience || !token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    const verified = payload.email_verified === true || payload.email_verified === "true";
    if (!email || !verified) return null;
    return {
      email,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  } catch {
    return null;
  }
}
