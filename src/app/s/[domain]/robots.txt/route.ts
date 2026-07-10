import { hotelOrigin, resolveHotelByDomain } from "@/lib/tenant/resolve";

/** Per-tenant robots.txt. Public URL: /robots.txt (middleware-routed). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel) return new Response("Unknown domain", { status: 404 });

  // "$"-terminated + slash variants so a CMS page like /ko/booking-guide
  // isn't swept up by a bare "/*/booking" prefix match.
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /s/",
    "Disallow: /*/booking$",
    "Disallow: /*/booking/",
    "",
    `Sitemap: ${hotelOrigin(hotel)}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
