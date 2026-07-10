import { hotelOrigin, resolveHotelByDomain } from "@/lib/tenant/resolve";

/** Per-tenant robots.txt. Public URL: /robots.txt (middleware-routed). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel) return new Response("Unknown domain", { status: 404 });

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /*/booking",
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
