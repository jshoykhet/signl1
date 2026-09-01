import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@whiskeysockets/baileys", "qrcode"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
