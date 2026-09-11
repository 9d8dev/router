import { describe, expect, it } from "vitest";

type HeaderRoute = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

describe("Next.js public asset configuration", () => {
  it("serves the versioned embed runtime with an immutable cache policy", async () => {
    const { default: nextConfig } = await import("../next.config.mjs");
    const config = nextConfig as { headers: () => Promise<HeaderRoute[]> };
    const routes = await config.headers();
    const runtime = routes.find((route) => route.source === "/embed/v1.js");

    expect(runtime?.headers).toContainEqual({
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    });
  });
});
