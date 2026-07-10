import { setRequestLocale } from "next-intl/server";
import type { Hotel } from "@/lib/data/types";
import { isPlatformLocale } from "@/lib/i18n/locales";
import { ensureLocale } from "@/lib/tenant/resolve";

/**
 * Page-level locale bootstrap: validate the candidate segment (redirecting
 * bare paths like /about → /ko/about), then activate the locale for
 * next-intl server translations. Call at the top of every page. Pages with
 * meaningful search params pass them as `query` so redirects keep them.
 */
export function activateLocale(
  hotel: Hotel,
  candidate: string,
  restSegments: string[] = [],
  query = "",
): string {
  const locale = ensureLocale(hotel, candidate, restSegments, query);
  setRequestLocale(isPlatformLocale(locale) ? locale : "ko");
  return locale;
}

/** Rebuild a query string from a page's resolved searchParams. */
export function queryStringFrom(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const v of value) params.append(key, v);
  }
  return params.toString();
}
