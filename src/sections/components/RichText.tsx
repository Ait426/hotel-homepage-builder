import { pickLocalized } from "@/lib/i18n/locales";
import type { RichTextV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function RichTextV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: RichTextV1Props;
}) {
  const { hotel, locale } = ctx;
  const heading = pickLocalized(props.heading, locale, hotel.defaultLocale);
  const body = pickLocalized(props.body, locale, hotel.defaultLocale);
  if (!body && !heading) return null;

  const align = props.align ?? "left";
  const alignCls = align === "center" ? "text-center" : "text-left";
  const paragraphs = (body ?? "").split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <section className="py-20 sm:py-28">
      <div className={`mx-auto w-full max-w-3xl px-5 sm:px-8 ${alignCls}`}>
        {heading ? (
          <h2 className="mb-8 font-display text-3xl leading-tight text-ink sm:text-4xl">
            {heading}
          </h2>
        ) : null}
        <div className="space-y-5">
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line text-base leading-8 text-ink-muted">
              {p}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
