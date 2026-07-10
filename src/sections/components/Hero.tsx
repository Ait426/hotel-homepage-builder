import Image from "next/image";
import Link from "next/link";
import { BookingSearchBar } from "@/components/booking/BookingSearchBar";
import { pickLocalized } from "@/lib/i18n/locales";
import { localeHref } from "@/lib/tenant/resolve";
import type { HeroV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function HeroV1({ ctx, props }: { ctx: SectionContext; props: HeroV1Props }) {
  const { hotel, locale } = ctx;
  const pick = (v: Parameters<typeof pickLocalized<string>>[0]) =>
    pickLocalized(v, locale, hotel.defaultLocale);

  const heading = pick(props.heading);
  const subheading = pick(props.subheading);
  const eyebrow = pick(props.eyebrow);
  const ctaLabel = props.cta ? pick(props.cta.label) : undefined;

  return (
    <section className="relative flex min-h-[92svh] flex-col justify-end">
      <Image
        src={props.image}
        alt={heading ?? ""}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/25" />

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-40 sm:px-8 sm:pb-20">
        {eyebrow ? (
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-white/80">
            {eyebrow}
          </p>
        ) : null}
        {heading ? (
          <h1 className="max-w-3xl whitespace-pre-line font-display text-4xl leading-[1.15] text-white sm:text-6xl">
            {heading}
          </h1>
        ) : null}
        {subheading ? (
          <p className="mt-5 max-w-xl text-base text-white/85 sm:text-lg">
            {subheading}
          </p>
        ) : null}
        {props.cta && ctaLabel ? (
          <Link
            href={localeHref(locale, props.cta.href)}
            className="mt-8 inline-block border border-white/70 px-8 py-3 text-sm font-medium tracking-widest text-white transition-colors hover:bg-white hover:text-ink"
          >
            {ctaLabel}
          </Link>
        ) : null}

        {props.showBookingBar ? (
          <div className="mt-12">
            <BookingSearchBar locale={locale} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
