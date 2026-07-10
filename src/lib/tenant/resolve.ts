/**
 * Tenant resolution (structural decision A2 + URL contract).
 *
 * Public URL shape:   https://{hotel-domain}/{locale}/{path}
 * Internal routing:   /s/{domain}/{locale}/{path}   (middleware rewrite)
 *
 * The middleware never touches the database — it only encodes the host into
 * the path. Actual domain → hotel lookup happens here, memoized per request.
 */

import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getDataSource } from "@/lib/data";
import type { Hotel } from "@/lib/data/types";
import { isPlatformLocale } from "@/lib/i18n/locales";
import { normalizeHost } from "@/lib/tenant/host";

export const resolveHotelByDomain = cache(
  async (domain: string): Promise<Hotel | null> => {
    const decoded = normalizeHost(decodeURIComponent(domain));
    if (!decoded) return null;
    return getDataSource().getHotelByDomain(decoded);
  },
);

/** Route-level guard: unknown domain → 404. */
export async function requireHotel(domain: string): Promise<Hotel> {
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel) notFound();
  return hotel;
}

/**
 * Locale guard used by every page under [locale].
 *
 * The first path segment is only a *candidate* locale — `/about` reaches the
 * home route with locale="about". Redirect rules:
 *  - candidate is a platform locale the hotel doesn't offer (/zh on a ko/en
 *    hotel) → swap it for the default locale: /zh/rooms → /ko/rooms
 *  - anything else is a bare path → prefix the default locale:
 *    /about → /ko/about
 * The query string is preserved (deep links from emails/ads carry state).
 */
export function ensureLocale(
  hotel: Hotel,
  candidate: string,
  restSegments: string[] = [],
  query = "",
): string {
  const decoded = decodeURIComponent(candidate);
  if (hotel.locales.includes(decoded)) return decoded;
  const rest = restSegments.filter(Boolean);
  const segments = isPlatformLocale(decoded) ? rest : [decoded, ...rest];
  const path = segments.join("/");
  const qs = query ? `?${query.replace(/^\?/, "")}` : "";
  redirect(`/${hotel.defaultLocale}${path ? `/${path}` : ""}${qs}`);
}

/** Public href for a locale + path ("/rooms/deluxe" or ""). */
export function localeHref(locale: string, path = ""): string {
  const suffix = path && !path.startsWith("/") ? `/${path}` : path;
  return `/${locale}${suffix === "/" ? "" : suffix}`;
}

/** Canonical origin for SEO (sitemaps, alternates, JSON-LD). */
export function hotelOrigin(hotel: Hotel): string {
  const local =
    hotel.primaryDomain.endsWith(".local") ||
    hotel.primaryDomain.startsWith("localhost");
  return `${local ? "http" : "https"}://${hotel.primaryDomain}`;
}
