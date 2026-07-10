import type { Metadata } from "next";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookingSearchBar } from "@/components/booking/BookingSearchBar";
import { getDataSource } from "@/lib/data";
import type { Hotel, RatePlan, RoomType, StayQuote } from "@/lib/data/types";
import { isValidISODate, nightsBetween, todayIn } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { activateLocale, queryStringFrom } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { localeHref, requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";

type Params = Promise<{ domain: string; locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  const t = await getTranslations({ locale, namespace: "booking" });
  return {
    ...buildPageMetadata(hotel, locale, "/booking", { title: t("title") }),
    robots: { index: false }, // transactional page
  };
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

interface Offer {
  room: RoomType;
  plans: Array<{ plan: RatePlan; quote: StayQuote }>;
}

async function findOffers(
  hotel: Hotel,
  checkIn: string,
  checkOut: string,
  guests: number,
  roomSlug?: string,
): Promise<Offer[]> {
  const data = getDataSource();
  const roomTypes = await data.listRoomTypes(hotel.id);
  const candidates = roomTypes.filter(
    (room) =>
      (!roomSlug || room.slug === roomSlug) && room.occupancyMax >= guests,
  );

  const offers = await Promise.all(
    candidates.map(async (room): Promise<Offer> => {
      const plans = await data.listRatePlans(hotel.id, room.id);
      const quoted = await Promise.all(
        plans.map(async (plan) => {
          const quote = await data.quoteStay(
            hotel.id,
            room.id,
            plan.id,
            checkIn,
            checkOut,
          );
          return quote ? { plan, quote } : null;
        }),
      );
      return { room, plans: quoted.filter((q) => q !== null) };
    }),
  );

  return offers.filter((offer) => offer.plans.length > 0);
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);
  const sp = await searchParams;
  const locale = activateLocale(hotel, rawLocale, ["booking"], queryStringFrom(sp));
  const t = await getTranslations("booking");
  const checkIn = str(sp.checkIn);
  const checkOut = str(sp.checkOut);
  const adults = Math.max(parseInt(str(sp.adults) ?? "2", 10) || 2, 1);
  const children = Math.max(parseInt(str(sp.children) ?? "0", 10) || 0, 0);
  const roomSlug = str(sp.roomType);

  const today = todayIn(hotel.timezone);
  const validStay =
    !!checkIn &&
    !!checkOut &&
    isValidISODate(checkIn) &&
    isValidISODate(checkOut) &&
    checkIn >= today &&
    nightsBetween(checkIn, checkOut) >= 1;

  const offers = validStay
    ? await findOffers(hotel, checkIn, checkOut, adults + children, roomSlug)
    : [];

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
      <h1 className="mb-8 font-display text-3xl text-ink sm:text-4xl">{t("title")}</h1>

      <BookingSearchBar
        locale={locale}
        compact
        initial={{ checkIn, checkOut, adults, children }}
      />

      {!validStay && (checkIn || checkOut) ? (
        <p className="mt-10 rounded-token border border-ink/10 bg-surface p-10 text-center text-sm text-ink-muted">
          {t("errors.invalid_stay_range")}
        </p>
      ) : null}

      {validStay ? (
        <div className="mt-10">
          <p className="mb-6 text-sm text-ink-muted">
            {t("nightsSummary", { nights: nightsBetween(checkIn, checkOut), rooms: 1 })}
          </p>

          {offers.length === 0 ? (
            <p className="rounded-token border border-ink/10 bg-surface p-10 text-center text-sm text-ink-muted">
              {t("noOffers")}
            </p>
          ) : (
            <ul className="space-y-8">
              {offers.map(({ room, plans }) => {
                const content = pickLocalized(room.content, locale, hotel.defaultLocale);
                const image = room.images[0];
                return (
                  <li
                    key={room.id}
                    className="grid overflow-hidden rounded-token bg-surface shadow-sm ring-1 ring-ink/5 md:grid-cols-[320px_1fr]"
                  >
                    <div className="relative aspect-[4/3] md:aspect-auto md:min-h-56">
                      {image ? (
                        <Image
                          src={image.url}
                          alt={content?.name ?? room.slug}
                          fill
                          sizes="(min-width: 768px) 320px, 100vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-brand/10" />
                      )}
                    </div>

                    <div className="p-6 sm:p-8">
                      <Link
                        href={localeHref(locale, `/rooms/${room.slug}`)}
                        className="font-display text-2xl text-ink hover:underline"
                      >
                        {content?.name ?? room.slug}
                      </Link>

                      <ul className="mt-5 divide-y divide-ink/10">
                        {plans.map(({ plan, quote }) => {
                          const soldOut = quote.remaining < 1;
                          const lowStock = !soldOut && quote.remaining <= 3;
                          const checkoutHref = localeHref(
                            locale,
                            `/booking/checkout?${new URLSearchParams({
                              roomType: room.slug,
                              ratePlan: plan.id,
                              checkIn,
                              checkOut,
                              adults: String(adults),
                              children: String(children),
                            }).toString()}`,
                          );
                          return (
                            <li
                              key={plan.id}
                              className="flex flex-wrap items-center justify-between gap-4 py-4"
                            >
                              <div>
                                <p className="text-sm font-medium text-ink">
                                  {pickLocalized(plan.name, locale, hotel.defaultLocale)}
                                </p>
                                {plan.cancellationPolicy.text ? (
                                  <p className="mt-0.5 text-xs text-ink-muted">
                                    {pickLocalized(
                                      plan.cancellationPolicy.text,
                                      locale,
                                      hotel.defaultLocale,
                                    )}
                                  </p>
                                ) : null}
                                {soldOut ? (
                                  <p className="mt-1 text-xs font-medium text-red-600">
                                    {t("soldOut")}
                                  </p>
                                ) : lowStock ? (
                                  <p className="mt-1 text-xs font-medium text-accent">
                                    {t("available", { count: quote.remaining })}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-5">
                                <div className="text-right">
                                  <p className="text-lg font-medium text-ink">
                                    {formatMoney(quote.totalPerRoom, quote.currency, locale)}
                                  </p>
                                  <p className="text-xs text-ink-muted">{t("totalForStay")}</p>
                                </div>
                                {soldOut ? null : (
                                  <Link
                                    href={checkoutHref}
                                    className="bg-brand px-6 py-3 text-xs font-medium tracking-widest text-brand-ink transition-opacity hover:opacity-90"
                                  >
                                    {t("reserve")}
                                  </Link>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
