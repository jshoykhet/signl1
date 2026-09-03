import { describe, expect, it } from "vitest";
import { generateTotpSecret, totpAuthUrl, totpFor, verifyTotp } from "./otp";
import { formatPhone, normalizePhone, parseE164, phoneToEmail } from "./phone";

describe("phone", () => {
  it("normalizes a US mobile number", () => {
    expect(normalizePhone("1", "4155552671")).toBe("14155552671");
    expect(normalizePhone("1", "(415) 555-2671")).toBe("14155552671");
    expect(normalizePhone("44", "7700 900123")).toBe("447700900123");
    expect(normalizePhone("1", "12")).toBeNull();
    expect(formatPhone("14155552671")).toBe("+14155552671");
    expect(parseE164("+1 (415) 555-2671")).toBe("14155552671");
    expect(phoneToEmail("14155552671")).toBe("14155552671@phone.signl1");
  });
});

describe("totp", () => {
  it("accepts the current code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    const token = totpFor(secret, "+14155552671").generate();
    expect(verifyTotp(secret, token, "+14155552671")).toBe(true);
    expect(verifyTotp(secret, "000000", "+14155552671")).toBe(false);
    expect(totpAuthUrl(secret, "+14155552671")).toContain("otpauth://totp/");
    expect(totpAuthUrl(secret, "+14155552671")).toContain("Signl1");
  });
});
