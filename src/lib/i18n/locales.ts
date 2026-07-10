/**
 * Locale plumbing.
 *
 * Two layers of localization (structural decision C):
 *  - UI strings (buttons, form labels, booking widget copy) live in
 *    /messages/<locale>.json and ship with the code (next-intl).
 *  - Hotel content (room descriptions, page sections) lives in the DB as
 *    locale-keyed objects: {"ko": ..., "en": ...} — hotel staff edit it
 *    without touching code.
 *
 * PLATFORM_LOCALES is the superset the platform ships UI strings for.
 * Each hotel picks a subset (hotels.locales) with a default
 * (hotels.default_locale).
 */

export const PLATFORM_LOCALES = ["ko", "en", "ja", "zh"] as const;
export type PlatformLocale = (typeof PLATFORM_LOCALES)[number];

export const LOCALE_LABELS: Record<PlatformLocale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

/** hreflang values for SEO alternates. */
export const LOCALE_HREFLANG: Record<PlatformLocale, string> = {
  ko: "ko",
  en: "en",
  ja: "ja",
  zh: "zh-Hans",
};

export function isPlatformLocale(value: string): value is PlatformLocale {
  return (PLATFORM_LOCALES as readonly string[]).includes(value);
}

/** A DB-stored localized value: {"ko": "...", "en": "..."} */
export type Localized<T = string> = Partial<Record<string, T>>;

/**
 * Resolve a localized value with fallback chain:
 * requested locale → hotel default locale → first available key.
 */
export function pickLocalized<T>(
  value: Localized<T> | undefined | null,
  locale: string,
  defaultLocale?: string,
): T | undefined {
  if (!value) return undefined;
  if (value[locale] !== undefined) return value[locale];
  if (defaultLocale && value[defaultLocale] !== undefined) {
    return value[defaultLocale];
  }
  const first = Object.keys(value)[0];
  return first !== undefined ? value[first] : undefined;
}
