/**
 * next-intl request config (UI strings only — hotel content is localized in
 * the DB, see src/lib/i18n/locales.ts).
 *
 * We don't use next-intl's routing middleware: the tenant middleware owns
 * URLs. The active locale is set per request by the tenant layout via
 * setRequestLocale().
 */

import { getRequestConfig } from "next-intl/server";
import { isPlatformLocale } from "@/lib/i18n/locales";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && isPlatformLocale(requested) ? requested : "ko";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
