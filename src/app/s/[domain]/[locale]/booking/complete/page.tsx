import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDataSource } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { activateLocale } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { localeHref, requireHotel } from "@/lib/tenant/resolve";

type Params = Promise<{ domain: string; locale: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { robots: { index: false } };

export default async function BookingCompletePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale, ["booking", "complete"]);
  const t = await getTranslations("booking");

  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : undefined;
  const email = typeof sp.email === "string" ? sp.email : undefined;
  if (!code || !email) notFound();

  const data = getDataSource();
  const reservation = await data.getReservation(hotel.id, code, email);
  if (!reservation) notFound();

  const room = (await data.listRoomTypes(hotel.id)).find(
    (r) => r.id === reservation.roomTypeId,
  );
  const roomName = room
    ? pickLocalized(room.content, locale, hotel.defaultLocale)?.name
    : undefined;

  return (
    <section className="mx-auto w-full max-w-2xl px-5 py-20 text-center sm:px-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-accent">
        {reservation.code}
      </p>
      <h1 className="mt-4 font-display text-3xl text-ink sm:text-4xl">
        {t("completeTitle")}
      </h1>
      <p className="mt-4 text-sm text-ink-muted">
        {t("completeBody", { code: reservation.code })}
      </p>

      <dl className="mt-10 space-y-3 rounded-token bg-surface p-8 text-left text-sm shadow-sm ring-1 ring-ink/5">
        {roomName ? (
          <div className="flex justify-between">
            <dt className="text-ink-muted">{t("roomsCount")}</dt>
            <dd className="font-medium text-ink">
              {roomName} × {reservation.rooms}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("checkIn")}</dt>
          <dd className="text-ink">{formatDate(reservation.checkIn, locale)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">{t("checkOut")}</dt>
          <dd className="text-ink">{formatDate(reservation.checkOut, locale)}</dd>
        </div>
        <div className="flex justify-between border-t border-ink/10 pt-3">
          <dt className="text-ink-muted">{t("totalForStay")}</dt>
          <dd className="text-lg font-medium text-ink">
            {formatMoney(reservation.amountTotal, reservation.currency, locale)}
          </dd>
        </div>
      </dl>

      <Link
        href={localeHref(locale)}
        className="mt-10 inline-block border border-ink/20 px-8 py-3 text-sm tracking-widest text-ink transition-colors hover:bg-ink hover:text-canvas"
      >
        {t("backToHome")}
      </Link>
    </section>
  );
}
