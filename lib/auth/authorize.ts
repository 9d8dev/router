import { NextResponse } from "next/server";

export const SIGN_IN_PATH = "/login";

/** Surfaces that must stay reachable without a dashboard session. */
export function isPublicFormSurface(url: {
  hostname: string;
  pathname: string;
}): boolean {
  return (
    url.hostname === "forms.router.so" ||
    url.pathname.startsWith("/f/") ||
    url.pathname.startsWith("/embed/") ||
    url.pathname.startsWith("/api/public/") ||
    url.pathname.startsWith("/api/integrations/wordpress/")
  );
}

/**
 * next-auth only redirects unauthenticated requests to the sign-in page on
 * its own when no custom middleware function is supplied. middleware.ts wraps
 * `auth()` to rewrite the forms host, so the redirect must be returned from
 * the `authorized` callback instead; next-auth honours a Response there.
 */
export function authorizeRequest({
  authenticated,
  nextUrl,
}: {
  authenticated: boolean;
  nextUrl: URL;
}): true | NextResponse {
  if (
    authenticated ||
    isPublicFormSurface(nextUrl) ||
    nextUrl.pathname === SIGN_IN_PATH
  ) {
    return true;
  }
  const signInUrl = new URL(SIGN_IN_PATH, nextUrl.href);
  signInUrl.searchParams.set("callbackUrl", nextUrl.href);
  return NextResponse.redirect(signInUrl);
}
