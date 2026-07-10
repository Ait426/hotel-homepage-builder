import type { Metadata } from "next";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AMENITY_LABELS, Icon } from "@/components/ui/Icon";
import { getDataSource } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { activateLocale } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { jsonLdString, roomJsonLd } from "@/lib/seo/jsonld";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { localeHref, requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";

type Params = Promise<{ domain: string; locale: string; room: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale, room: roomSlug } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  // decode to match the page body's lookup (non-ASCII slugs arrive encoded)
  const room = await getDataSource().getRoomTypeBySlug(
    hotel.id,
    decodeURIComponent(roomSlug),
  );
  if (!room) return {};
  const content = pickLocalized(room.content, locale, hotel.defaultLocale);
  return buildPageMetadata(hotel, locale, `/rooms/${room.slug}`, {
    title: content?.name,
    description: content?.tagline,
    ogImage: room.images[0]?.url,
  });
}

export default async function RoomDetailPage({ params }: { params: Params }) {
  const { domain, locale: rawLocale, room: roomSlug } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale, ["rooms", roomSlug]);

  const data = getDataSource();
  const room = await data.getRoomTypeBySlug(hotel.id, decodeURIComponent(roomSlug));
  if (!room) notFound();
  const plans = await data.listRatePlans(hotel.id, room.id);

  const [t, tCommon] = await Promise.all([
    getTranslations("rooms"),
    getTranslations("common"),
  ]);
  const content = pickLocalized(room.content, locale, hotel.defaultLocale);
  const paragraphs = (content?.description ?? "").split(/\n\s*\n/).filter(Boolean);
  const [mainImage, ...moreImages] = room.images;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(roomJsonLd(hotel, room, plans, locale)),
        }}
      />

      {mainImage ? (
        <div className="relative aspect-[21/9] min-h-72 w-full">
          <Image
            src={mainImage.url}
            alt={pickLocalized(mainImage.alt, locale, hotel.defaultLocale) ?? content?.name ?? ""}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
            {t("occupancy", { base: room.occupancyBase, max: room.occupancyMax })}
            {room.sizeSqm ? ` · ${t("size", { size: room.sizeSqm })}` : ""}
          </p>
          <h1 className="mt-3 font-display text-4xl text-ink">{content?.name}</h1>
          {content?.tagline ? (
            <p className="mt-3 text-lg text-ink-muted">{content.tagline}</p>
          ) : null}

          <div className="mt-8 space-y-5">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line leading-8 text-ink-muted">
                {p}
              </p>
            ))}
          </div>

          {room.amenities.length ? (
            <div className="mt-10">
              <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-ink-muted">
                {t("amenities")}
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {room.amenities.map((amenity) => (
                  <li key={amenity} className="flex items-center gap-2.5 text-sm text-ink">
                    <Icon name={amenity} className="h-5 w-5 text-accent" />
                    {AMENITY_LABELS[amenity]?.[locale] ??
                      AMENITY_LABELS[amenity]?.[hotel.defaultLocale] ??
                      amenity}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {moreImages.length ? (
            <div className="mt-10 grid grid-cols-2 gap-3">
              {moreImages.map((image, i) => (
                <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-token">
                  <Image
                    src={image.url}
                    alt={pickLocalized(image.alt, locale, hotel.defaultLocale) ?? ""}
                    fill
                    sizes="(min-width: 1024px) 33vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="h-fit rounded-token bg-surface p-7 shadow-sm ring-1 ring-ink/5 lg:sticky lg:top-24">
          <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-ink-muted">
            {t("ratePlans")}
          </h2>
          <ul className="space-y-4">
            {plans.map((plan) => (
              <li key={plan.id} className="border-b border-ink/10 pb-4 last:border-none">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {pickLocalized(plan.name, locale, hotel.defaultLocale)}
                  </span>
                  <span className="whitespace-nowrap text-sm text-ink">
                    <span className="mr-1 text-xs text-ink-muted">{tCommon("from")}</span>
                    {formatMoney(plan.basePrice, hotel.currency, locale)}
                  </span>
                </div>
                {plan.cancellationPolicy.text ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    {pickLocalized(plan.cancellationPolicy.text, locale, hotel.defaultLocale)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <Link
            href={localeHref(locale, `/booking?roomType=${room.slug}`)}
            className="mt-6 block bg-brand px-6 py-4 text-center text-sm font-medium tracking-widest text-brand-ink transition-opacity hover:opacity-90"
          >
            {t("checkAvailability")}
          </Link>
        </aside>
      </section>
    </>
  );
}
