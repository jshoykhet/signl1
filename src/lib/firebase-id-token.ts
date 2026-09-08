import { createRemoteJWKSet, jwtVerify } from "jose";
import { firebaseProjectId } from "./firebase-config";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export type FirebasePhoneClaims = {
  phone: string;
  uid: string;
};

export async function verifyFirebaseIdToken(idToken: string): Promise<FirebasePhoneClaims | null> {
  const projectId = firebaseProjectId();
  const token = idToken.trim();
  if (!projectId || !token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    const phone = typeof payload.phone_number === "string" ? payload.phone_number : "";
    const uid = typeof payload.sub === "string" ? payload.sub : "";
    if (!phone || !uid) return null;
    return { phone, uid };
  } catch {
    return null;
  }
}
