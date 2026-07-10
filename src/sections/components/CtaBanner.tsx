import Image from "next/image";
import Link from "next/link";
import { pickLocalized } from "@/lib/i18n/locales";
import { localeHref } from "@/lib/tenant/resolve";
import type { CtaBannerV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function CtaBannerV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: CtaBannerV1Props;
}) {
  const { hotel, locale } = ctx;
  const pick = (v: Parameters<typeof pickLocalized<string>>[0]) =>
    pickLocalized(v, locale, hotel.defaultLocale);

  const heading = pick(props.heading);
  const subheading = pick(props.subheading);
  const ctaLabel = pick(props.cta.label);
  if (!heading && !subheading && !ctaLabel) return null;

  const hasImage = Boolean(props.image);

  const buttonCls = hasImage
    ? "border-white/70 text-white hover:bg-white hover:text-ink"
    : "border-brand-ink/60 text-brand-ink hover:bg-brand-ink hover:text-brand";

  return (
    <section
      className={
        hasImage ? "relative overflow-hidden" : "bg-brand text-brand-ink"
      }
    >
      {hasImage ? (
        <>
          <Image
            src={props.image as string}
            alt={heading ?? ""}
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/55" />
        </>
      ) : null}

      <div
        className={`relative mx-auto w-full max-w-2xl px-5 py-24 text-center sm:px-8 sm:py-32 ${
          hasImage ? "text-white" : ""
        }`}
      >
        {heading ? (
          <h2 className="whitespace-pre-line font-display text-3xl leading-[1.15] sm:text-5xl">
            {heading}
          </h2>
        ) : null}
        {subheading ? (
          <p className="mx-auto mt-5 max-w-xl text-base opacity-80 sm:text-lg">
            {subheading}
          </p>
        ) : null}
        {ctaLabel ? (
          <Link
            href={localeHref(locale, props.cta.href)}
            className={`mt-10 inline-block border px-8 py-3 text-sm font-medium uppercase tracking-widest transition-colors ${buttonCls}`}
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
