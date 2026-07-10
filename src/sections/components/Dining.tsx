import Image from "next/image";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { pickLocalized } from "@/lib/i18n/locales";
import type { DiningV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function DiningV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: DiningV1Props;
}) {
  const { hotel, locale } = ctx;
  const pick = (v: Parameters<typeof pickLocalized<string>>[0]) =>
    pickLocalized(v, locale, hotel.defaultLocale);

  const heading = pick(props.heading);
  const subheading = pick(props.subheading);

  return (
    <section className="bg-canvas py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeading heading={heading} subheading={subheading} />

        <div className="space-y-16 sm:space-y-24">
          {props.venues.map((venue, i) => {
            const name = pick(venue.name);
            const description = pick(venue.description);
            const location = pick(venue.location);

            const text = (
              <div className={venue.image ? undefined : "mx-auto max-w-2xl text-center"}>
                {name ? (
                  <h3 className="font-display text-2xl leading-snug text-ink">
                    {name}
                  </h3>
                ) : null}
                {description ? (
                  <p className="mt-4 text-base leading-relaxed text-ink-muted">
                    {description}
                  </p>
                ) : null}
                {venue.hours ? (
                  <p
                    className={`mt-6 border-accent text-xs font-medium uppercase tracking-[0.2em] text-ink ${
                      venue.image ? "border-l pl-4" : ""
                    }`}
                  >
                    <span className="text-accent">{venue.hours}</span>
                  </p>
                ) : null}
                {location ? (
                  <p className="mt-2 text-sm text-ink-muted">{location}</p>
                ) : null}
              </div>
            );

            if (!venue.image) {
              return <div key={i}>{text}</div>;
            }

            return (
              <div
                key={i}
                className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
              >
                <div
                  className={`relative aspect-[4/3] overflow-hidden rounded-token ${
                    i % 2 === 1 ? "md:order-2" : ""
                  }`}
                >
                  <Image
                    src={venue.image}
                    alt={name ?? ""}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                {text}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
