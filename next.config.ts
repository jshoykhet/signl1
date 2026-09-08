import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@whiskeysockets/baileys", "qrcode"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Default is bottom-left, which sits on the phone tab bar's Launch item.
  devIndicators: { position: "top-right" },
};

export default nextConfig;
