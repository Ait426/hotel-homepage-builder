import { Icon } from "@/components/ui/Icon";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { pickLocalized } from "@/lib/i18n/locales";
import type { AmenitiesV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function AmenitiesV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: AmenitiesV1Props;
}) {
  const { hotel, locale } = ctx;
  const pick = (v: Parameters<typeof pickLocalized<string>>[0]) =>
    pickLocalized(v, locale, hotel.defaultLocale);

  const heading = pick(props.heading);
  const subheading = pick(props.subheading);

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeading heading={heading} subheading={subheading} />

        <ul className="grid grid-cols-2 gap-8 sm:gap-10 lg:grid-cols-4">
          {props.items.map((item, i) => {
            const title = pick(item.title);
            const description = pick(item.description);
            return (
              <li key={i} className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full ring-1 ring-accent/40 text-accent">
                  <Icon name={item.icon} className="h-6 w-6" />
                </span>
                {title ? (
                  <p className="mt-4 font-medium text-ink">{title}</p>
                ) : null}
                {description ? (
                  <p className="mt-1.5 text-sm text-ink-muted">{description}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
