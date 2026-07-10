import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { activateLocale } from "@/lib/i18n/server";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";
import { RoomsShowcaseV1 } from "@/sections/components/RoomsShowcase";

type Params = Promise<{ domain: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  const t = await getTranslations({ locale, namespace: "rooms" });
  return buildPageMetadata(hotel, locale, "/rooms", { title: t("title") });
}

export default async function RoomsPage({ params }: { params: Params }) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale, ["rooms"]);
  const t = await getTranslations("rooms");

  return (
    <RoomsShowcaseV1
      ctx={{ hotel, locale }}
      props={{ heading: { [locale]: t("title") } }}
    />
  );
}
