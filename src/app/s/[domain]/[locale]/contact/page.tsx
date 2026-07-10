import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactForm } from "@/components/contact/ContactForm";
import { activateLocale } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";

type Params = Promise<{ domain: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  const t = await getTranslations({ locale, namespace: "contact" });
  return buildPageMetadata(hotel, locale, "/contact", { title: t("title") });
}

export default async function ContactPage({ params }: { params: Params }) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale, ["contact"]);
  const t = await getTranslations("contact");

  const address = pickLocalized(hotel.contact.address, locale, hotel.defaultLocale);

  return (
    <section className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
      <div className="mb-10 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">{t("title")}</h1>
        <p className="mt-4 text-sm text-ink-muted">{t("intro")}</p>
      </div>

      {(address || hotel.contact.phone || hotel.contact.email) && (
        <div className="mb-10 space-y-1.5 rounded-token bg-surface p-6 text-center text-sm text-ink-muted shadow-sm ring-1 ring-ink/5">
          {address ? <p>{address}</p> : null}
          {hotel.contact.phone ? (
            <p>
              <a href={`tel:${hotel.contact.phone}`} className="hover:text-ink">
                {hotel.contact.phone}
              </a>
            </p>
          ) : null}
          {hotel.contact.email ? (
            <p>
              <a href={`mailto:${hotel.contact.email}`} className="hover:text-ink">
                {hotel.contact.email}
              </a>
            </p>
          ) : null}
        </div>
      )}

      <ContactForm locale={locale} />
    </section>
  );
}
