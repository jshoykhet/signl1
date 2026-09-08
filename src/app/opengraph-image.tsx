import { generateOgImage, OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og-image";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpenGraphImage() {
  return generateOgImage();
}
