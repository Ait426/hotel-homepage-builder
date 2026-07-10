import { ContactForm } from "@/components/contact/ContactForm";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { pickLocalized } from "@/lib/i18n/locales";
import type { ContactFormV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function ContactFormSectionV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: ContactFormV1Props;
}) {
  const { hotel, locale } = ctx;
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-2xl px-5 sm:px-8">
        <SectionHeading
          heading={pickLocalized(props.heading, locale, hotel.defaultLocale)}
          subheading={pickLocalized(props.intro, locale, hotel.defaultLocale)}
        />
        <ContactForm locale={locale} />
      </div>
    </section>
  );
}
