/**
 * Host → tenant rewrite (URL contract, structural priority #2).
 *
 * Public URL:  https://hotel-a.com/ko/rooms/deluxe
 * Rewritten:   /s/hotel-a.com/ko/rooms/deluxe
 *
 * Deliberately DB-free: the middleware only encodes the host into the path.
 * Domain lookup, locale validation and redirects happen in the route layer
 * (src/lib/tenant/resolve.ts), where results are cached per request.
 */

import { NextRequest, NextResponse } from "next/server";
import { isPlatformLocale } from "@/lib/i18n/locales";
import { tenantDomainFromHost } from "@/lib/tenant/host";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never rewrite internal targets (avoids loops if /s/… is hit directly).
  if (pathname === "/s" || pathname.startsWith("/s/")) {
    return NextResponse.next();
  }

  const domain = tenantDomainFromHost(req.headers.get("host"));

  const url = req.nextUrl.clone();
  url.pathname = `/s/${domain}${pathname === "/" ? "" : pathname}`;

  // Surface the candidate locale so the root layout can SSR <html lang=…>.
  const firstSegment = pathname.split("/")[1] ?? "";
  const requestHeaders = new Headers(req.headers);
  if (isPlatformLocale(firstSegment)) {
    requestHeaders.set("x-locale", firstSegment);
  }

  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  // Everything except Next internals, API routes and static files —
  // plus the two well-known files that DO need tenant routing.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
    "/sitemap.xml",
    "/robots.txt",
  ],
};
