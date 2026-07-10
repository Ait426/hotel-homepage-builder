"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

export interface NavItem {
  label: string;
  href: string; // locale-relative, e.g. "/rooms"
}

/**
 * Tenant site header. Client component for the mobile menu + locale switcher;
 * all strings arrive pre-translated from the server layout.
 */
export function SiteHeader({
  hotelName,
  locale,
  locales,
  localeLabels,
  nav,
  bookLabel,
}: {
  hotelName: string;
  locale: string;
  locales: string[];
  localeLabels: Record<string, string>;
  nav: NavItem[];
  bookLabel: string;
}) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // /ko/rooms/deluxe → /{other}/rooms/deluxe (first segment is the locale
  // for every rendered page; bare paths never reach the client). Keep the
  // query string so switching language mid-booking doesn't lose the search.
  const restPath = (() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] === locale) segments.shift();
    const query = searchParams?.toString();
    return `${segments.length ? `/${segments.join("/")}` : ""}${query ? `?${query}` : ""}`;
  })();

  const href = (path: string) => `/${locale}${path === "/" ? "" : path}`;

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <Link href={href("/")} className="font-display text-lg tracking-wide text-ink">
          {hotelName}
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={href(item.href)}
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-ink-muted sm:flex">
            {locales.map((l, i) => (
              <span key={l} className="flex items-center gap-2">
                {i > 0 ? <span aria-hidden>·</span> : null}
                <Link
                  href={`/${l}${restPath}`}
                  hrefLang={l}
                  className={
                    l === locale
                      ? "font-medium text-ink"
                      : "transition-colors hover:text-ink"
                  }
                >
                  {localeLabels[l] ?? l.toUpperCase()}
                </Link>
              </span>
            ))}
          </div>

          <Link
            href={href("/booking")}
            className="hidden bg-brand px-5 py-2.5 text-xs font-medium tracking-widest text-brand-ink transition-opacity hover:opacity-90 md:inline-block"
          >
            {bookLabel}
          </Link>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label="menu"
            className="flex h-10 w-10 cursor-pointer flex-col items-center justify-center gap-1.5 md:hidden"
          >
            <span className={`h-px w-5 bg-ink transition-transform ${open ? "translate-y-[3.5px] rotate-45" : ""}`} />
            <span className={`h-px w-5 bg-ink transition-transform ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          aria-label="mobile"
          className="border-t border-ink/10 bg-canvas px-5 py-4 md:hidden"
        >
          <ul className="space-y-3">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={href(item.href)}
                  onClick={() => setOpen(false)}
                  className="block py-1 text-sm text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={href("/booking")}
                onClick={() => setOpen(false)}
                className="mt-2 block bg-brand px-5 py-3 text-center text-xs font-medium tracking-widest text-brand-ink"
              >
                {bookLabel}
              </Link>
            </li>
            <li className="flex gap-4 pt-2 text-xs text-ink-muted">
              {locales.map((l) => (
                <Link key={l} href={`/${l}${restPath}`} hrefLang={l} onClick={() => setOpen(false)}>
                  {localeLabels[l] ?? l.toUpperCase()}
                </Link>
              ))}
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
