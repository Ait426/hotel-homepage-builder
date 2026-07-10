import { SectionHeading } from "@/components/ui/SectionHeading";
import { pickLocalized } from "@/lib/i18n/locales";
import type { FaqV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function FaqV1({ ctx, props }: { ctx: SectionContext; props: FaqV1Props }) {
  const { hotel, locale } = ctx;
  const pick = (v: Parameters<typeof pickLocalized<string>>[0]) =>
    pickLocalized(v, locale, hotel.defaultLocale);

  const heading = pick(props.heading);

  const items = props.items
    .map((item) => ({
      question: pick(item.question),
      answer: pick(item.answer),
    }))
    .filter((item) => item.question);

  if (items.length === 0) return null;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <SectionHeading heading={heading} />

        <div className="divide-y divide-ink/10 border-y border-ink/10">
          {items.map((item, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left [&::-webkit-details-marker]:hidden">
                <span className="font-medium text-ink">{item.question}</span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-lg font-light leading-none text-ink-muted transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              {item.answer ? (
                <p className="pt-3 text-sm/relaxed text-ink-muted whitespace-pre-line">
                  {item.answer}
                </p>
              ) : null}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
