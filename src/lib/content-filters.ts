/**
 * Tape filters for crypto noise (except listed crypto-equity names)
 * and Telegram / WhatsApp promo.
 */

export const CRYPTO_EQUITY_TICKERS = new Set([
  "COIN",
  "MSTR",
  "MARA",
  "RIOT",
  "CLSK",
  "HUT",
  "BITF",
  "HIVE",
  "BTBT",
  "IREN",
  "CIFR",
  "WULF",
  "CORZ",
  "BTDR",
  "BTCS",
  "CAN",
  "GLXY",
  "CRCL",
  "BMNR",
  "SBET",
  "BITO",
  "GBTC",
  "IBIT",
  "FBTC",
  "ARKB",
  "BITB",
  "HODL",
  "BTCO",
  "BRRR",
  "EZBC",
  "ETHE",
  "ETHA",
]);

const TOKEN_TICKERS = new Set([
  "BTC",
  "ETH",
  "SOL",
  "DOGE",
  "XRP",
  "ADA",
  "AVAX",
  "DOT",
  "LINK",
  "UNI",
  "NEAR",
  "SUI",
  "APT",
  "TON",
  "TRX",
  "SHIB",
  "PEPE",
  "WIF",
  "BONK",
  "FLOKI",
  "ORDI",
  "INJ",
  "FET",
  "RENDER",
  "MATIC",
  "POL",
  "BNB",
  "ATOM",
  "FIL",
  "LTC",
  "BCH",
  "ETC",
  "HBAR",
  "OP",
  "ARB",
  "SEI",
  "TIA",
  "JUP",
  "WLD",
  "TAO",
]);

const CASHTAG = /\$([A-Za-z]{1,6})\b/g;

const CRYPTO_TALK =
  /\b(bitcoin|ethereum|solana|dogecoin|ripple|cardano|polkadot|avalanche|litecoin|memecoin|meme coin|altcoin|altcoins|cryptocurrency|crypto\b|defi\b|web3|nft\b|nfts|airdrop|airdrops|blockchain|on-chain|onchain|stablecoin|stablecoins|binance|metamask|ledger nano|cold wallet|hot wallet|seed phrase|minting|whitelisted mint|token launch|ico\b|ieo\b|inscriptions?|ordinals|brc-20|spl token)\b/i;

const CRYPTO_HANDLE = /(crypto|nft|defi|web3|airdrop|memecoin|bitcoin|btc|eth|solana|nft)/i;

const MESSAGING =
  /\b(telegram|whatsapp|whats\s?app)\b|t\.me\/|wa\.me\/|chat\.whatsapp\.com|tg:\/\/|\bjoin (my |our )?(vip )?telegram\b|\bdm me on (tg|telegram|whatsapp)\b|\btelegram group\b|\bwhatsapp group\b|\bwhatsapp channel\b/i;

export function cashtagsIn(text: string): string[] {
  const found: string[] = [];
  const re = new RegExp(CASHTAG.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    found.push(match[1].toUpperCase());
  }
  return found;
}

export function hasCryptoEquityCashtag(text: string): boolean {
  return cashtagsIn(text).some((tag) => CRYPTO_EQUITY_TICKERS.has(tag));
}

export function hasCryptoTokenCashtag(text: string): boolean {
  return cashtagsIn(text).some((tag) => TOKEN_TICKERS.has(tag));
}

export function looksLikeCryptoHandle(handle: string | undefined): boolean {
  if (!handle) return false;
  return CRYPTO_HANDLE.test(handle.replace(/^@/, ""));
}

export function isCryptoNoise(text: string, handle?: string): boolean {
  if (hasCryptoEquityCashtag(text)) return false;
  if (hasCryptoTokenCashtag(text)) return true;
  if (CRYPTO_TALK.test(text)) return true;
  if (looksLikeCryptoHandle(handle) && !hasCryptoEquityCashtag(text)) return true;
  return false;
}

export function isMessagingPromo(text: string): boolean {
  return MESSAGING.test(text);
}
