import { describe, expect, it } from "vitest";
import {
  hasCryptoEquityCashtag,
  isCryptoNoise,
  isMessagingPromo,
} from "./content-filters";

describe("crypto tape filter", () => {
  it("drops token talk and $BTC", () => {
    expect(isCryptoNoise("Long $BTC here, easy 100x")).toBe(true);
    expect(isCryptoNoise("Solana memecoin season is back")).toBe(true);
    expect(isCryptoNoise("NFT mint tonight, whitelist in bio")).toBe(true);
  });

  it("keeps listed crypto-equity names even when bitcoin is mentioned", () => {
    expect(hasCryptoEquityCashtag("$COIN volume spike into the print")).toBe(true);
    expect(isCryptoNoise("$MSTR added more bitcoin to the treasury")).toBe(false);
    expect(isCryptoNoise("$IBIT inflows $1.2bn as bitcoin ETF bid")).toBe(false);
  });

  it("drops crypto-native handles unless they cite a crypto stock", () => {
    expect(isCryptoNoise("$TSLA delivery beat", "solana_trader")).toBe(true);
    expect(isCryptoNoise("$COIN beats EPS", "nft_alpha")).toBe(false);
  });

  it("does not flag ordinary markets copy", () => {
    expect(isCryptoNoise("$AAPL beats EPS; FOMC-sensitive names bid")).toBe(false);
    expect(isCryptoNoise("OPEC+ production cut; Brent bid", "DeItaone")).toBe(false);
  });

  it("in venture mode keeps crypto-sector funding and drops memecoins", () => {
    expect(isCryptoNoise("Crypto startup raises $40m Series A for on-chain settlement", undefined, "venture")).toBe(
      false,
    );
    expect(isCryptoNoise("New memecoin airdrop tonight, 100x gem", undefined, "venture")).toBe(true);
  });
});

describe("messaging promo filter", () => {
  it("drops Telegram and WhatsApp funnels", () => {
    expect(isMessagingPromo("Join my Telegram for daily setups t.me/alphadesk")).toBe(true);
    expect(isMessagingPromo("WhatsApp group for live flow — wa.me/15551234567")).toBe(true);
    expect(isMessagingPromo("DM me on telegram for the VIP list")).toBe(true);
  });

  it("leaves ordinary catalyst copy alone", () => {
    expect(isMessagingPromo("$NVDA beats EPS; guidance raised 12%")).toBe(false);
  });
});
