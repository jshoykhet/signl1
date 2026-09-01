import { describe, expect, it } from "vitest";
import {
  hasCompletedPairHandshake,
  shouldDropSyntheticMe,
  isTransientWhatsAppDisconnect,
  userFacingWhatsAppError,
  WA_RESTART_REQUIRED,
} from "./whatsapp-disconnect";

describe("WhatsApp pair handshake", () => {
  it("keeps me after pair-success even if registered is still false", () => {
    const creds = {
      registered: false,
      me: { id: "16469014469@s.whatsapp.net", name: "~" },
      account: { details: "x" },
    };
    expect(hasCompletedPairHandshake(creds)).toBe(true);
    expect(shouldDropSyntheticMe(creds)).toBe(false);
  });

  it("drops the synthetic pairing me when the phone has not confirmed", () => {
    const creds = {
      registered: false,
      me: { id: "16469014469@s.whatsapp.net", name: "~" },
    };
    expect(hasCompletedPairHandshake(creds)).toBe(false);
    expect(shouldDropSyntheticMe(creds)).toBe(true);
  });

  it("never drops a fully registered session", () => {
    expect(
      shouldDropSyntheticMe({
        registered: true,
        me: { id: "1@s.whatsapp.net" },
        account: {},
      }),
    ).toBe(false);
  });
});

describe("WhatsApp disconnect copy", () => {
  it("treats 515 as a transient restart", () => {
    expect(isTransientWhatsAppDisconnect(WA_RESTART_REQUIRED)).toBe(true);
    expect(userFacingWhatsAppError("Stream Errored (restart required)")).toBeNull();
  });

  it("keeps real errors", () => {
    expect(userFacingWhatsAppError("WhatsApp is not linked yet. Scan the QR.")).toContain("not linked");
  });
});
