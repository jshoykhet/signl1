import { Secret, TOTP } from "otpauth";

export const OTP_DIGITS = 6;
export const OTP_PERIOD = 30;
export const OTP_ISSUER = "Signl1";

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpFor(secret: string, label: string): TOTP {
  return new TOTP({
    issuer: OTP_ISSUER,
    label,
    algorithm: "SHA1",
    digits: OTP_DIGITS,
    period: OTP_PERIOD,
    secret: Secret.fromBase32(secret),
  });
}

export function totpAuthUrl(secret: string, label: string): string {
  return totpFor(secret, label).toString();
}

export function verifyTotp(secret: string, code: string, label = "Signl1"): boolean {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const delta = totpFor(secret, label).validate({ token, window: 1 });
  return delta !== null;
}
