import { getDataSource } from "@/lib/data";
import { LOCALE_HREFLANG, isPlatformLocale } from "@/lib/i18n/locales";
import { hotelOrigin, resolveHotelByDomain } from "@/lib/tenant/resolve";

/**
 * Per-tenant sitemap with hreflang alternates. Public URL: /sitemap.xml
 * (the middleware routes it here per domain).
 */

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel) return new Response("Unknown domain", { status: 404 });

  const data = getDataSource();
  const [pages, rooms, posts] = await Promise.all([
    data.listPublishedPages(hotel.id),
    data.listRoomTypes(hotel.id),
    data.listPosts(hotel.id),
  ]);

  const paths = [
    ...pages.map((p) => p.path),
    "/rooms",
    ...rooms.map((r) => `/rooms/${r.slug}`),
    ...(posts.length > 0 ? ["/news", ...posts.map((p) => `/news/${p.slug}`)] : []),
    "/contact",
  ];
  const uniquePaths = [...new Set(paths)];
  const origin = hotelOrigin(hotel);

  const urls = uniquePaths
    .flatMap((path) => {
      const suffix = path === "/" ? "" : path;
      const alternates = [
        ...hotel.locales.map((locale) => {
          const hreflang = isPlatformLocale(locale) ? LOCALE_HREFLANG[locale] : locale;
          return `    <xhtml:link rel="alternate" hreflang="${esc(hreflang)}" href="${esc(`${origin}/${locale}${suffix}`)}"/>`;
        }),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(`${origin}/${hotel.defaultLocale}${suffix}`)}"/>`,
      ].join("\n");

      return hotel.locales.map(
        (locale) =>
          `  <url>\n    <loc>${esc(`${origin}/${locale}${suffix}`)}</loc>\n${alternates}\n  </url>`,
      );
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
