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

  // The internal /s/… namespace must not be publicly addressable: it would
  // serve any tenant's site under any domain (duplicate/cross-tenant
  // content). Rewrites don't re-enter the middleware, so this only blocks
  // external requests.
  if (pathname === "/s" || pathname.startsWith("/s/")) {
    return new NextResponse(null, { status: 404 });
  }

  // Platform routes that bypass tenant rewriting (onboarding wizard).
  if (pathname === "/start" || pathname.startsWith("/start/")) {
    return NextResponse.next();
  }

  let domain = tenantDomainFromHost(req.headers.get("host"));

  // Preview override (demo/dev pathway): ?_tenant={domain} pins a generated
  // tenant via cookie so the whole site — every path — renders that tenant
  // on this host. ?_tenant= (empty) clears it. Production previews use real
  // wildcard subdomains instead.
  const overrideParam = req.nextUrl.searchParams.get("_tenant");
  const override =
    overrideParam !== null
      ? overrideParam
      : req.cookies.get("preview_tenant")?.value;
  if (override) domain = override;

  if (!domain) {
    // unconfigured deployment reached via a platform host — nothing to serve
    return new NextResponse(null, { status: 404 });
  }

  const url = req.nextUrl.clone();
  url.pathname = `/s/${domain}${pathname === "/" ? "" : pathname}`;
  url.searchParams.delete("_tenant");

  // Surface the candidate locale so the root layout can SSR <html lang=…>.
  const firstSegment = pathname.split("/")[1] ?? "";
  const requestHeaders = new Headers(req.headers);
  if (isPlatformLocale(firstSegment)) {
    requestHeaders.set("x-locale", firstSegment);
  }

  const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  if (overrideParam !== null) {
    if (overrideParam) {
      res.cookies.set("preview_tenant", overrideParam, { path: "/", maxAge: 3600 });
    } else {
      res.cookies.delete("preview_tenant");
    }
  }
  return res;
}

export const config = {
  // Everything except Next internals, API routes and static files —
  // plus the two well-known files that DO need tenant routing.
  matcher: [
    // "api/" (not bare "api") so real paths like /apis or /api-guide on a
    // tenant site still get tenant routing. Static assets are excluded by
    // extension ALLOWLIST (not "any dot") so legacy page URLs from migrated
    // sites (/room01.html, /sub.php) still reach the 301 redirect layer.
    "/((?!api/|api$|_next/|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|css|js|mjs|map|json|woff2?|ttf|otf|eot|mp4|webm|pdf|zip)$).*)",
    "/sitemap.xml",
    "/robots.txt",
    // /s/{domain}/… contains dots — match explicitly so external access is
    // always blocked regardless of the pattern above.
    "/s/:path*",
  ],
};
