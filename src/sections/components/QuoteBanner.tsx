import { pickLocalized } from "@/lib/i18n/locales";
import type { QuoteBannerV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function QuoteBannerV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: QuoteBannerV1Props;
}) {
  const { hotel, locale } = ctx;
  const eyebrow = pickLocalized(props.eyebrow, locale, hotel.defaultLocale);
  const quote = pickLocalized(props.quote, locale, hotel.defaultLocale);
  const attribution = pickLocalized(
    props.attribution,
    locale,
    hotel.defaultLocale,
  );
  if (!quote) return null;

  return (
    <section className="bg-brand py-20 sm:py-28">
      <figure className="mx-auto w-full max-w-3xl px-5 text-center sm:px-8">
        {eyebrow ? (
          <p className="mb-6 text-xs font-medium uppercase tracking-[0.3em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        <blockquote>
          <p className="whitespace-pre-line font-display text-2xl leading-snug text-brand-ink sm:text-4xl sm:leading-[1.35]">
            {quote}
          </p>
        </blockquote>
        {attribution ? (
          <figcaption className="mt-8 text-sm tracking-widest text-brand-ink/70">
            {attribution}
          </figcaption>
        ) : null}
      </figure>
    </section>
  );
}
