import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { pickLocalized } from "@/lib/i18n/locales";
import type { Hotel } from "@/lib/data/types";
import type { NavItem } from "./SiteHeader";

export async function SiteFooter({
  hotel,
  locale,
  nav,
}: {
  hotel: Hotel;
  locale: string;
  nav: NavItem[];
}) {
  const t = await getTranslations("footer");
  const name = pickLocalized(hotel.name, locale, hotel.defaultLocale) ?? hotel.slug;
  const address = pickLocalized(hotel.contact.address, locale, hotel.defaultLocale);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-brand text-brand-ink">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:grid-cols-3 sm:px-8">
        <div>
          <p className="font-display text-xl">{name}</p>
          {address ? (
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-ink/70">
              {address}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 text-sm text-brand-ink/70">
          {hotel.contact.phone ? (
            <p>
              <a href={`tel:${hotel.contact.phone}`} className="hover:text-brand-ink">
                {hotel.contact.phone}
              </a>
            </p>
          ) : null}
          {hotel.contact.email ? (
            <p>
              <a href={`mailto:${hotel.contact.email}`} className="hover:text-brand-ink">
                {hotel.contact.email}
              </a>
            </p>
          ) : null}
          {hotel.contact.checkIn && hotel.contact.checkOut ? (
            <p>
              {t("checkInOut", {
                checkIn: hotel.contact.checkIn,
                checkOut: hotel.contact.checkOut,
              })}
            </p>
          ) : null}
        </div>

        <nav aria-label="footer" className="space-y-2 text-sm">
          {nav.map((item) => (
            <p key={item.href}>
              <Link
                href={`/${locale}${item.href === "/" ? "" : item.href}`}
                className="text-brand-ink/70 transition-colors hover:text-brand-ink"
              >
                {item.label}
              </Link>
            </p>
          ))}
        </nav>
      </div>

      <div className="border-t border-brand-ink/15">
        <p className="mx-auto w-full max-w-6xl px-5 py-6 text-xs text-brand-ink/50 sm:px-8">
          © {year} {name}. {t("rights")}
        </p>
      </div>
    </footer>
  );
}
