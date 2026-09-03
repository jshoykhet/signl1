import { describe, expect, it } from "vitest";
import { sameOriginCallbackPath } from "./dev-preview";

describe("sameOriginCallbackPath", () => {
  it("keeps a same-origin path", () => {
    expect(sameOriginCallbackPath("/")).toBe("/");
    expect(sameOriginCallbackPath("/inbox")).toBe("/inbox");
    expect(sameOriginCallbackPath("/settings?tab=access")).toBe("/settings?tab=access");
  });

  it("rejects absolute or protocol-relative URLs that would leave the preview host", () => {
    expect(sameOriginCallbackPath("http://localhost:3847/")).toBe("/");
    expect(sameOriginCallbackPath("//localhost:3847/")).toBe("/");
    expect(sameOriginCallbackPath("https://evil.example/")).toBe("/");
    expect(sameOriginCallbackPath(undefined)).toBe("/");
  });
});
