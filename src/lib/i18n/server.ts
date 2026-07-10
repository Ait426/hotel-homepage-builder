import { setRequestLocale } from "next-intl/server";
import type { Hotel } from "@/lib/data/types";
import { isPlatformLocale } from "@/lib/i18n/locales";
import { ensureLocale } from "@/lib/tenant/resolve";

/**
 * Page-level locale bootstrap: validate the candidate segment (redirecting
 * bare paths like /about → /ko/about), then activate the locale for
 * next-intl server translations. Call at the top of every page.
 */
export function activateLocale(
  hotel: Hotel,
  candidate: string,
  restSegments: string[] = [],
): string {
  const locale = ensureLocale(hotel, candidate, restSegments);
  setRequestLocale(isPlatformLocale(locale) ? locale : "ko");
  return locale;
}
