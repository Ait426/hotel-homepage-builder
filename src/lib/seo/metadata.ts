/**
 * SEO conventions (the "rules, not decisions" layer):
 *  - canonical + hreflang alternates on every page, derived from the
 *    hotel's primary domain and locale set
 *  - per-page meta falls back to the hotel's default meta
 *  - og tags mirror the resolved title/description/image
 */

import type { Metadata } from "next";
import type { Hotel, PageSeo } from "@/lib/data/types";
import { LOCALE_HREFLANG, isPlatformLocale, pickLocalized } from "@/lib/i18n/locales";
import { hotelOrigin, localeHref } from "@/lib/tenant/resolve";

export function languageAlternates(
  hotel: Hotel,
  path: string,
): Record<string, string> {
  const alternates: Record<string, string> = {};
  for (const locale of hotel.locales) {
    const hreflang = isPlatformLocale(locale) ? LOCALE_HREFLANG[locale] : locale;
    alternates[hreflang] = localeHref(locale, path);
  }
  alternates["x-default"] = localeHref(hotel.defaultLocale, path);
  return alternates;
}

export function buildPageMetadata(
  hotel: Hotel,
  locale: string,
  path: string,
  pageSeo?: PageSeo,
): Metadata {
  const hotelName = pickLocalized(hotel.name, locale, hotel.defaultLocale) ?? hotel.slug;
  const defaultTitle = pickLocalized(hotel.seo.title, locale, hotel.defaultLocale);
  const defaultDescription = pickLocalized(
    hotel.seo.description,
    locale,
    hotel.defaultLocale,
  );

  const title = pageSeo?.title
    ? path === "/"
      ? pageSeo.title
      : `${pageSeo.title} | ${hotelName}`
    : (defaultTitle ?? hotelName);
  const description = pageSeo?.description ?? defaultDescription;
  const ogImage = pageSeo?.ogImage ?? hotel.seo.ogImage;

  return {
    metadataBase: new URL(hotelOrigin(hotel)),
    title,
    description,
    alternates: {
      canonical: localeHref(locale, path),
      languages: languageAlternates(hotel, path),
    },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: hotelName,
      locale,
      url: localeHref(locale, path),
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}
