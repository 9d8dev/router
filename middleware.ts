import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((request) => {
  if (request.nextUrl.hostname !== "forms.router.so") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/embed/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const publicId = pathname.split("/").filter(Boolean)[0];
  if (!publicId) {
    return NextResponse.rewrite(new URL("/f/not-found", request.url));
  }
  return NextResponse.rewrite(
    new URL(`/f/${encodeURIComponent(publicId)}`, request.url)
  );
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|check-email|.*\\.svg$).*)",
  ],
};
