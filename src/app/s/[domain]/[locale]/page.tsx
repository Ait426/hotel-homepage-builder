import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDataSource } from "@/lib/data";
import { activateLocale } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { hotelJsonLd, jsonLdString } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";
import { SectionRenderer } from "@/sections/SectionRenderer";

type Params = Promise<{ domain: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  const page = await getDataSource().getPage(hotel.id, "/");
  const seo = pickLocalized(page?.seo, locale, hotel.defaultLocale);
  return buildPageMetadata(hotel, locale, "/", seo);
}

export default async function HomePage({ params }: { params: Params }) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale);

  const page = await getDataSource().getPage(hotel.id, "/");
  if (!page) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(hotelJsonLd(hotel, locale)) }}
      />
      <SectionRenderer sections={page.sections} ctx={{ hotel, locale }} />
    </>
  );
}
