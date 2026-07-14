import { redirect } from "next/navigation";
import { resolveHotelByDomain } from "@/lib/tenant/resolve";

/**
 * Tenant root ("/" on a hotel domain, rewritten to /s/{domain}) — redirect
 * to the hotel's default locale. A route handler (not a page) so the tenant
 * locale layout can stay the only page tree.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const { domain } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel) {
    return new Response("Unknown domain", { status: 404 });
  }
  // carry the incoming querystring across the "/" → "/{locale}" redirect —
  // utm_*, ?_tenant, booking prefills etc. would otherwise be dropped here
  const { search } = new URL(req.url);
  redirect(`/${hotel.defaultLocale}${search}`);
}
