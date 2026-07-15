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
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin/auth";
import { isPlatformLocale } from "@/lib/i18n/locales";
import {
  isPlatformHost,
  isValidTenantDomain,
  normalizeHost,
  tenantDomainFromHost,
} from "@/lib/tenant/host";

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

  // Console: open in demo mode, HTTP Basic elsewhere (temporary until
  // Supabase Auth lands — see src/lib/admin/auth.ts).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!checkAdminAuth(req)) return unauthorizedResponse() as NextResponse;
    return NextResponse.next();
  }

  let domain = tenantDomainFromHost(req.headers.get("host"));

  // Preview override (demo/dev pathway): ?_tenant={domain} pins a generated
  // tenant via cookie so the whole site — every path — renders that tenant
  // on this host. ?_tenant= (empty) clears it. Production previews use real
  // wildcard subdomains instead.
  //
  // The value (param OR cookie — both are caller-controlled) lands in the
  // rewrite path below, so it must be a bare domain: isValidTenantDomain
  // rejects slashes, empty labels ("..") and anything else that could steer
  // the rewrite outside /s/ — e.g. into /admin, skipping the auth gate
  // above (rewrites don't re-enter the middleware). In production the
  // override is honored only on platform hosts (preview deployments): a
  // visitor on one tenant's real domain must not be able to render another
  // tenant's site — or spoofed content — under that domain.
  const previewAllowed =
    process.env.NODE_ENV !== "production" ||
    isPlatformHost(normalizeHost(req.headers.get("host") ?? ""));
  const overrideParam = req.nextUrl.searchParams.get("_tenant");
  const overrideRaw =
    overrideParam !== null
      ? overrideParam
      : (req.cookies.get("preview_tenant")?.value ?? "");
  const override = normalizeHost(overrideRaw.trim());
  const overrideAccepted =
    override !== "" && previewAllowed && isValidTenantDomain(override);
  if (overrideAccepted) domain = override;

  if (!domain || !isValidTenantDomain(domain)) {
    // unconfigured deployment reached via a platform host, or a host header
    // that doesn't look like a domain — nothing to serve
    return new NextResponse(null, { status: 404 });
  }

  const url = req.nextUrl.clone();
  url.pathname = `/s/${domain}${pathname === "/" ? "" : pathname}`;
  url.searchParams.delete("_tenant");

  // Belt-and-suspenders: the rewrite MUST stay inside the tenant namespace.
  // Today this holds because `domain` is LDH-validated and Next normalizes
  // dot-segments in `pathname` before the middleware runs, but nothing in
  // this file enforces it — assert it so a future framework/routing change
  // can't silently let a request escape /s/{domain} (e.g. into /admin).
  const prefix = `/s/${domain}`;
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
    return new NextResponse(null, { status: 404 });
  }

  // Surface the candidate locale so the root layout can SSR <html lang=…>.
  const firstSegment = pathname.split("/")[1] ?? "";
  const requestHeaders = new Headers(req.headers);
  if (isPlatformLocale(firstSegment)) {
    requestHeaders.set("x-locale", firstSegment);
  }

  const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  if (overrideParam !== null) {
    if (overrideAccepted) {
      res.cookies.set("preview_tenant", override, { path: "/", maxAge: 3600 });
    } else {
      // explicit clear (?_tenant=) or a rejected value — drop it either way
      res.cookies.delete("preview_tenant");
    }
  } else if (overrideRaw && !overrideAccepted) {
    // stale/invalid preview cookie (or preview not allowed on this host)
    res.cookies.delete("preview_tenant");
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
