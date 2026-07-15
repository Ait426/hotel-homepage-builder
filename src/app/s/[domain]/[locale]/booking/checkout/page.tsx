import type { Metadata } from "next";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookingForm } from "@/components/booking/BookingForm";
import { getDataSource } from "@/lib/data";
import { isValidISODate, nightsBetween, todayIn } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";
import { activateLocale, queryStringFrom } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";

type Params = Promise<{ domain: string; locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

// tenant-branded title (not the platform's), never indexed
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return { robots: { index: false } };
  const t = await getTranslations({ locale, namespace: "booking" });
  const hotelName = pickLocalized(hotel.name, locale, hotel.defaultLocale) ?? hotel.slug;
  return { title: `${t("title")} | ${hotelName}`, robots: { index: false } };
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);
  const sp = await searchParams;
  const locale = activateLocale(
    hotel,
    rawLocale,
    ["booking", "checkout"],
    queryStringFrom(sp),
  );
  const t = await getTranslations("booking");
  const roomSlug = str(sp.roomType);
  const ratePlanId = str(sp.ratePlan);
  const checkIn = str(sp.checkIn);
  const checkOut = str(sp.checkOut);
  const adults = Math.max(parseInt(str(sp.adults) ?? "2", 10) || 2, 1);
  const children = Math.max(parseInt(str(sp.children) ?? "0", 10) || 0, 0);

  if (
    !roomSlug ||
    !ratePlanId ||
    !checkIn ||
    !checkOut ||
    !isValidISODate(checkIn) ||
    !isValidISODate(checkOut) ||
    checkIn < todayIn(hotel.timezone) ||
    nightsBetween(checkIn, checkOut) < 1
  ) {
    notFound();
  }

  const data = getDataSource();
  const room = await data.getRoomTypeBySlug(hotel.id, roomSlug);
  if (!room) notFound();
  const quote = await data.quoteStay(hotel.id, room.id, ratePlanId, checkIn, checkOut, {
    adults,
    children,
  });
  if (!quote || quote.remaining < 1) notFound();

  const plans = await data.listRatePlans(hotel.id, room.id);
  const plan = plans.find((p) => p.id === ratePlanId);
  const content = pickLocalized(room.content, locale, hotel.defaultLocale);
  const image = room.images[0];

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
      {/* stay summary */}
      <aside className="h-fit overflow-hidden rounded-token bg-surface shadow-sm ring-1 ring-ink/5">
        {image ? (
          <div className="relative aspect-[16/9]">
            <Image
              src={image.url}
              alt={content?.name ?? room.slug}
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
        ) : null}
        <div className="space-y-4 p-7">
          <div>
            <h1 className="font-display text-2xl text-ink">{content?.name}</h1>
            {plan ? (
              <p className="mt-1 text-sm text-ink-muted">
                {pickLocalized(plan.name, locale, hotel.defaultLocale)}
              </p>
            ) : null}
          </div>

          <dl className="space-y-2 border-t border-ink/10 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t("checkIn")}</dt>
              <dd className="text-ink">{formatDate(checkIn, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t("checkOut")}</dt>
              <dd className="text-ink">{formatDate(checkOut, locale)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t("adults")} / {t("children")}</dt>
              <dd className="text-ink">{adults} / {children}</dd>
            </div>
          </dl>

          <div className="space-y-1.5 border-t border-ink/10 pt-4 text-sm">
            {quote.nights.map((night) => (
              <div key={night.date} className="flex justify-between text-ink-muted">
                <span>{formatDate(night.date, locale)}</span>
                <span>{formatMoney(night.price, quote.currency, locale)}</span>
              </div>
            ))}
            {quote.extraGuestTotal > 0 ? (
              <div className="flex justify-between text-ink-muted">
                <span>{t("extraGuestFee")}</span>
                <span>{formatMoney(quote.extraGuestTotal, quote.currency, locale)}</span>
              </div>
            ) : null}
            {quote.discountAmount > 0 ? (
              <div className="flex justify-between text-brand">
                <span>{t("discount")}</span>
                <span>−{formatMoney(quote.discountAmount, quote.currency, locale)}</span>
              </div>
            ) : null}
          </div>

          <div className="flex items-baseline justify-between border-t border-ink/10 pt-4">
            <span className="text-sm text-ink-muted">{t("totalForStay")}</span>
            <span className="text-xl font-medium text-ink">
              {formatMoney(quote.total, quote.currency, locale)}
            </span>
          </div>
          {plan?.cancellationPolicy.text ? (
            <p className="text-xs text-ink-muted">
              {pickLocalized(plan.cancellationPolicy.text, locale, hotel.defaultLocale)}
            </p>
          ) : null}
        </div>
      </aside>

      {/* guest form */}
      <div className="rounded-token bg-surface p-7 shadow-sm ring-1 ring-ink/5 sm:p-9">
        <BookingForm
          locale={locale}
          roomTypeId={room.id}
          ratePlanId={ratePlanId}
          checkIn={checkIn}
          checkOut={checkOut}
          adults={adults}
          children={children}
          expectedTotal={quote.total}
        />
      </div>
    </section>
  );
}
