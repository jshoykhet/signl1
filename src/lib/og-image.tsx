import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_NAME, SITE_TAGLINE } from "./site";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const OG_CONTENT_TYPE = "image/png";

export async function generateOgImage() {
  const logo = await readFile(join(process.cwd(), "public/signl1-logo-256.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(160deg, #141416 0%, #0b0b0d 55%, #1a1408 100%)",
          color: "#f4f4f6",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <img
            src={logoSrc}
            width={132}
            height={132}
            alt=""
            style={{
              borderRadius: 36,
              boxShadow: "0 0 0 1px rgba(251, 191, 36, 0.28)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 72,
                fontWeight: 650,
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {SITE_NAME}
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 28,
                color: "#d4a017",
                letterSpacing: "-0.02em",
              }}
            >
              SignlHQ
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
          <div
            style={{
              fontSize: 44,
              fontWeight: 560,
              letterSpacing: "-0.035em",
              lineHeight: 1.12,
            }}
          >
            {SITE_TAGLINE}
          </div>
          <div style={{ fontSize: 26, color: "#b8b8c0", letterSpacing: "-0.01em" }}>
            Search X from WhatsApp · signl1.xyz
          </div>
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: -80,
            top: 90,
            width: 420,
            height: 420,
            borderRadius: 420,
            border: "18px solid rgba(212, 160, 23, 0.16)",
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 20,
            top: 190,
            width: 220,
            height: 220,
            borderRadius: 220,
            border: "14px solid rgba(212, 160, 23, 0.22)",
          }}
        />
      </div>
    ),
    { ...OG_SIZE },
  );
}
