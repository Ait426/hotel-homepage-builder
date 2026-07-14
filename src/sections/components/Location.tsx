import { SectionHeading } from "@/components/ui/SectionHeading";
import { pickLocalized } from "@/lib/i18n/locales";
import { isAllowedMapEmbed } from "@/lib/maps";
import type { LocationV1Props } from "@/sections/schemas";
import type { SectionContext } from "@/sections/types";

/**
 * Row labels for the contact card. UI-level strings, but kept in code (like
 * AMENITY_LABELS in Icon.tsx) so the section stays a sync server component.
 */
const LABELS: Record<string, Record<string, string>> = {
  address: { ko: "주소", en: "Address", ja: "住所", zh: "地址" },
  phone: { ko: "전화", en: "Phone", ja: "電話", zh: "电话" },
  email: { ko: "이메일", en: "Email", ja: "メール", zh: "邮箱" },
  checkIn: { ko: "체크인", en: "Check-in", ja: "チェックイン", zh: "入住" },
  checkOut: { ko: "체크아웃", en: "Check-out", ja: "チェックアウト", zh: "退房" },
};

export function LocationV1({
  ctx,
  props,
}: {
  ctx: SectionContext;
  props: LocationV1Props;
}) {
  const { hotel, locale } = ctx;
  const label = (key: string) =>
    pickLocalized(LABELS[key], locale, hotel.defaultLocale);

  const heading = pickLocalized(props.heading, locale, hotel.defaultLocale);
  const description = pickLocalized(props.description, locale, hotel.defaultLocale);
  const paragraphs = (description ?? "").split(/\n\s*\n/).filter((p) => p.trim());

  // mapEmbedUrl is tenant-editable content: restrict the iframe src to known
  // map-provider embed hosts (https-only). Anything else — a javascript: URL,
  // or an https URL framing an arbitrary site — is dropped. See lib/maps.
  const mapEmbedUrl = isAllowedMapEmbed(props.mapEmbedUrl)
    ? props.mapEmbedUrl
    : undefined;

  const { contact } = hotel;
  const address = pickLocalized(contact.address, locale, hotel.defaultLocale);
  const showCard = Boolean(
    props.showContact &&
      (address || contact.phone || contact.email || contact.checkIn || contact.checkOut),
  );

  const hasColumns = paragraphs.length > 0 || showCard;
  if (!heading && !hasColumns && !mapEmbedUrl) return null;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeading heading={heading} />

        {hasColumns ? (
          <div className="grid gap-10 md:grid-cols-2">
            {paragraphs.length > 0 ? (
              <div className="space-y-5">
                {paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className="whitespace-pre-line text-base leading-8 text-ink-muted"
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : null}

            {showCard ? (
              <dl className="space-y-6 self-start rounded-token bg-surface p-8 ring-1 ring-ink/5">
                {address ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">
                      {label("address")}
                    </dt>
                    <dd className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink">
                      {address}
                    </dd>
                  </div>
                ) : null}

                {contact.phone ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">
                      {label("phone")}
                    </dt>
                    <dd className="mt-1.5 text-sm leading-6">
                      <a
                        href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                        className="text-ink transition-colors hover:text-accent"
                      >
                        {contact.phone}
                      </a>
                    </dd>
                  </div>
                ) : null}

                {contact.email ? (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">
                      {label("email")}
                    </dt>
                    <dd className="mt-1.5 text-sm leading-6">
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-ink transition-colors hover:text-accent"
                      >
                        {contact.email}
                      </a>
                    </dd>
                  </div>
                ) : null}

                {contact.checkIn || contact.checkOut ? (
                  <div className="grid grid-cols-2 gap-6 border-t border-ink/10 pt-6">
                    {contact.checkIn ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">
                          {label("checkIn")}
                        </dt>
                        <dd className="mt-1.5 text-sm leading-6 text-ink">
                          {contact.checkIn}
                        </dd>
                      </div>
                    ) : null}
                    {contact.checkOut ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-[0.2em] text-ink-muted">
                          {label("checkOut")}
                        </dt>
                        <dd className="mt-1.5 text-sm leading-6 text-ink">
                          {contact.checkOut}
                        </dd>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        ) : null}

        {mapEmbedUrl ? (
          <iframe
            src={mapEmbedUrl}
            className={`h-72 w-full rounded-token border-0 ${hasColumns || heading ? "mt-12" : ""}`}
            loading="lazy"
            title="map"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : null}
      </div>
    </section>
  );
}
