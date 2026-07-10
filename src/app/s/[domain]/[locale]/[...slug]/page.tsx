import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDataSource } from "@/lib/data";
import { activateLocale } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";
import { SectionRenderer } from "@/sections/SectionRenderer";

/**
 * CMS catch-all: any published sectioned page (/about, /facilities/spa …).
 * System routes (rooms, booking, contact) are static segments and win over
 * this catch-all automatically.
 */

type Params = Promise<{ domain: string; locale: string; slug: string[] }>;

function toPath(slug: string[]): string {
  return `/${slug.map(decodeURIComponent).join("/")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale, slug } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  const path = toPath(slug);
  const page = await getDataSource().getPage(hotel.id, path);
  if (!page) return {};
  const seo = pickLocalized(page.seo, locale, hotel.defaultLocale);
  return buildPageMetadata(hotel, locale, path, seo);
}

export default async function CmsPage({ params }: { params: Params }) {
  const { domain, locale: rawLocale, slug } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale, slug);

  const page = await getDataSource().getPage(hotel.id, toPath(slug));
  if (!page) notFound();

  return <SectionRenderer sections={page.sections} ctx={{ hotel, locale }} />;
}
