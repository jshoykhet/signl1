import { describe, expect, it } from "vitest";
import { isLoopbackHost, isPrefetchRequest, publicOrigin } from "./request-origin";

describe("publicOrigin", () => {
  it("uses the Cursor preview host instead of AUTH_URL", () => {
    process.env.AUTH_URL = "http://127.0.0.1:3847";
    const host = "p-3847-pod-example.agent.cvm.dev";
    const origin = publicOrigin(
      new Request("http://127.0.0.1:3847/skip", {
        headers: {
          host: "127.0.0.1:3847",
          "x-forwarded-host": host,
          "x-forwarded-proto": "https",
        },
      }),
    );
    expect(origin).toBe(`https://${host}`);
  });

  it("falls back to AUTH_URL on loopback", () => {
    process.env.AUTH_URL = "http://127.0.0.1:3847";
    const origin = publicOrigin(
      new Request("http://127.0.0.1:3847/skip", { headers: { host: "127.0.0.1:3847" } }),
    );
    expect(origin).toBe("http://127.0.0.1:3847");
  });

  it("treats the preview hostname as public even without forwarded proto", () => {
    delete process.env.AUTH_URL;
    const host = "p-3847-pod-example.agent.cvm.dev";
    const origin = publicOrigin(new Request("http://127.0.0.1:3847/skip", { headers: { host } }));
    expect(origin).toBe(`https://${host}`);
  });
});

describe("isLoopbackHost", () => {
  it("detects loopback names", () => {
    expect(isLoopbackHost("127.0.0.1:3847")).toBe(true);
    expect(isLoopbackHost("localhost:3847")).toBe(true);
    expect(isLoopbackHost("p-3847-pod.agent.cvm.dev")).toBe(false);
  });
});

describe("isPrefetchRequest", () => {
  it("skips speculative GETs so Chrome prefetch does not sign in", () => {
    expect(isPrefetchRequest(new Request("http://127.0.0.1/skip", { headers: { purpose: "prefetch" } }))).toBe(
      true,
    );
    expect(isPrefetchRequest(new Request("http://127.0.0.1/skip"))).toBe(false);
  });
});
