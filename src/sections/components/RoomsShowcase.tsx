import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getDataSource } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { pickLocalized } from "@/lib/i18n/locales";
import { localeHref } from "@/lib/tenant/resolve";
import type { RoomsShowcaseV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

/** Data-driven section: renders live room types, not editor-entered copies. */
export async function RoomsShowcaseV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: RoomsShowcaseV1Props;
}) {
  const { hotel, locale } = ctx;
  const t = await getTranslations("common");
  const data = getDataSource();

  const [roomTypes, ratePlans] = await Promise.all([
    data.listRoomTypes(hotel.id),
    data.listRatePlans(hotel.id),
  ]);
  const rooms = props.limit ? roomTypes.slice(0, props.limit) : roomTypes;
  if (rooms.length === 0) return null;

  const minPrice = new Map<string, number>();
  for (const plan of ratePlans) {
    const current = minPrice.get(plan.roomTypeId);
    if (current === undefined || plan.basePrice < current) {
      minPrice.set(plan.roomTypeId, plan.basePrice);
    }
  }

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeading
          heading={pickLocalized(props.heading, locale, hotel.defaultLocale)}
          subheading={pickLocalized(props.subheading, locale, hotel.defaultLocale)}
        />

        <div className="grid gap-8 sm:grid-cols-2">
          {rooms.map((room) => {
            const content = pickLocalized(room.content, locale, hotel.defaultLocale);
            const image = room.images[0];
            const from = minPrice.get(room.id);
            const href = localeHref(locale, `/rooms/${room.slug}`);
            return (
              <Link
                key={room.id}
                href={href}
                className="group overflow-hidden rounded-token bg-surface shadow-sm ring-1 ring-ink/5 transition-shadow hover:shadow-lg"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {image ? (
                    <Image
                      src={image.url}
                      alt={pickLocalized(image.alt, locale, hotel.defaultLocale) ?? content?.name ?? room.slug}
                      fill
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-brand/10" />
                  )}
                </div>
                <div className="p-6 sm:p-7">
                  <h3 className="font-display text-xl text-ink sm:text-2xl">
                    {content?.name ?? room.slug}
                  </h3>
                  {content?.tagline ? (
                    <p className="mt-2 text-sm text-ink-muted">{content.tagline}</p>
                  ) : null}
                  <div className="mt-5 flex items-end justify-between border-t border-ink/10 pt-4">
                    <span className="text-xs uppercase tracking-[0.15em] text-ink-muted">
                      {room.sizeSqm ? `${room.sizeSqm}㎡ · ` : ""}
                      {t("viewDetails")}
                    </span>
                    {from !== undefined ? (
                      <span className="text-right text-sm text-ink">
                        <span className="mr-1 text-xs text-ink-muted">{t("from")}</span>
                        <span className="font-medium">
                          {formatMoney(from, hotel.currency, locale)}
                        </span>
                        <span className="ml-1 text-xs text-ink-muted">/ {t("perNight")}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
