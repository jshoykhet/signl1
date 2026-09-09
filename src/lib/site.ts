export const SITE_NAME = "Signl1";
export const SITE_TAGLINE = "Customize your feed so you get only high-signal information";
export const SITE_DESCRIPTION =
  "Customize your feed so you get only high-signal information.";

export function siteUrl(): URL {
  const fromAuth = process.env.AUTH_URL?.trim();
  if (fromAuth && !fromAuth.includes("127.0.0.1") && !fromAuth.includes("localhost")) {
    return new URL(fromAuth.replace(/\/$/, ""));
  }
  const domain = process.env.DOMAIN?.trim();
  if (domain && domain !== "localhost") {
    return new URL(`https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`);
  }
  return new URL("https://signl1.xyz");
}
