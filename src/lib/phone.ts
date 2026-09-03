export type DialCountry = {
  iso: string;
  name: string;
  dial: string;
};

export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: "US", name: "United States", dial: "1" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "IN", name: "India", dial: "91" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "NL", name: "Netherlands", dial: "31" },
  { iso: "IE", name: "Ireland", dial: "353" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "MX", name: "Mexico", dial: "52" },
  { iso: "JP", name: "Japan", dial: "81" },
  { iso: "KR", name: "South Korea", dial: "82" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "SE", name: "Sweden", dial: "46" },
  { iso: "CH", name: "Switzerland", dial: "41" },
  { iso: "ES", name: "Spain", dial: "34" },
];

const EMAIL_PHONE_DOMAIN = "phone.signl1";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** E.164 without the plus, 8–15 digits including country code. */
export function normalizePhone(dial: string, national: string): string | null {
  const country = digitsOnly(dial);
  let local = digitsOnly(national);
  if (!country || !local) return null;
  if (local.startsWith("0")) local = local.slice(1);
  if (local.startsWith(country) && local.length > country.length + 6) {
    local = local.slice(country.length);
  }
  const e164 = `${country}${local}`;
  if (e164.length < 8 || e164.length > 15) return null;
  return e164;
}

export function parseE164(raw: string | null | undefined): string | null {
  const digits = digitsOnly(raw ?? "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function formatPhone(e164: string): string {
  const digits = digitsOnly(e164);
  if (!digits) return "";
  return `+${digits}`;
}

export function phoneToEmail(e164: string): string {
  return `${digitsOnly(e164)}@${EMAIL_PHONE_DOMAIN}`;
}

export function emailLooksLikePhone(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${EMAIL_PHONE_DOMAIN}`));
}

export function displayIdentity(email: string | null | undefined, name: string | null | undefined): string {
  if (emailLooksLikePhone(email)) {
    const digits = email!.split("@")[0] ?? "";
    return formatPhone(digits);
  }
  return name?.trim() || email?.trim() || "Signed in";
}
