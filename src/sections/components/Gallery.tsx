import { SafeImage as Image } from "@/components/ui/SafeImage";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { pickLocalized } from "@/lib/i18n/locales";
import type { GalleryV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

export function GalleryV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: GalleryV1Props;
}) {
  const { hotel, locale } = ctx;
  const heading = pickLocalized(props.heading, locale, hotel.defaultLocale);
  if (props.images.length === 0) return null;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeading heading={heading} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 sm:gap-4">
          {props.images.map((image, i) => {
            const alt =
              pickLocalized(image.alt, locale, hotel.defaultLocale) ?? "";
            const isLead = i === 0;
            return (
              <div
                key={`${image.url}-${i}`}
                className={`group relative aspect-[4/3] overflow-hidden rounded-token ${
                  isLead ? "md:col-span-2 md:row-span-2" : ""
                }`}
              >
                <Image
                  src={image.url}
                  alt={alt}
                  fill
                  sizes={
                    isLead
                      ? "(min-width: 1152px) 768px, (min-width: 768px) 66vw, 50vw"
                      : "(min-width: 1152px) 384px, (min-width: 768px) 33vw, 50vw"
                  }
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
