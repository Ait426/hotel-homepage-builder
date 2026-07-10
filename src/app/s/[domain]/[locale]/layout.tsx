import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { isPlatformLocale, LOCALE_LABELS, pickLocalized } from "@/lib/i18n/locales";
import { requireHotel } from "@/lib/tenant/resolve";
import { themeCssVars } from "@/lib/theme";

/**
 * Tenant chrome: theme tokens → CSS vars, i18n provider, header/footer.
 *
 * The locale param here is only a *candidate* (bare paths like /about land
 * with locale="about"). Layouts can't see deeper params, so redirects for
 * invalid locales happen in the pages (activateLocale); this layout just
 * falls back to the default locale so the pass-through render is sane.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ domain: string; locale: string }>;
}) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);

  const candidate = decodeURIComponent(rawLocale);
  const locale = hotel.locales.includes(candidate) ? candidate : hotel.defaultLocale;
  const uiLocale = isPlatformLocale(locale) ? locale : "ko";
  setRequestLocale(uiLocale);

  const [messages, tNav] = await Promise.all([
    getMessages({ locale: uiLocale }),
    getTranslations({ locale: uiLocale, namespace: "nav" }),
  ]);

  const nav = [
    { label: tNav("rooms"), href: "/rooms" },
    { label: tNav("about"), href: "/about" },
    { label: tNav("contact"), href: "/contact" },
  ];

  const hotelName = pickLocalized(hotel.name, locale, hotel.defaultLocale) ?? hotel.slug;

  return (
    <NextIntlClientProvider locale={uiLocale} messages={messages}>
      {/* tenant design tokens (see src/lib/theme) */}
      <style dangerouslySetInnerHTML={{ __html: themeCssVars(hotel.theme) }} />
      <div className="flex min-h-screen flex-col">
        <SiteHeader
          hotelName={hotelName}
          locale={locale}
          locales={hotel.locales}
          localeLabels={LOCALE_LABELS}
          nav={nav}
          bookLabel={tNav("booking")}
        />
        <main className="flex-1">{children}</main>
        <SiteFooter hotel={hotel} locale={locale} nav={nav} />
      </div>
    </NextIntlClientProvider>
  );
}
