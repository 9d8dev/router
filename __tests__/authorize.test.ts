import { describe, expect, it } from "vitest";
import { authorizeRequest } from "@/lib/auth/authorize";

const url = (path: string, host = "app.router.so") =>
  new URL(path, `https://${host}`);

describe("authorizeRequest", () => {
  it("redirects signed-out dashboard requests to the sign-in page", () => {
    const result = authorizeRequest({
      authenticated: false,
      nextUrl: url("/endpoints?tab=all"),
    });
    expect(result).not.toBe(true);
    if (result === true) throw new Error("expected a redirect");
    expect(result.status).toBe(307);
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe(
      "https://app.router.so/endpoints?tab=all"
    );
  });

  it("does not redirect the sign-in page itself", () => {
    expect(
      authorizeRequest({ authenticated: false, nextUrl: url("/login") })
    ).toBe(true);
  });

  it("allows signed-in requests", () => {
    expect(
      authorizeRequest({ authenticated: true, nextUrl: url("/") })
    ).toBe(true);
  });

  it("keeps public form surfaces reachable without a session", () => {
    for (const path of [
      "/f/abc",
      "/embed/v1.js",
      "/api/public/forms/abc/definition",
      "/api/integrations/wordpress/connect",
    ]) {
      expect(
        authorizeRequest({ authenticated: false, nextUrl: url(path) })
      ).toBe(true);
    }
    expect(
      authorizeRequest({
        authenticated: false,
        nextUrl: url("/abc", "forms.router.so"),
      })
    ).toBe(true);
  });
});
