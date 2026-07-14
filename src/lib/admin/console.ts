/**
 * Console request guard — authenticate, then resolve the tenant the request
 * targets. Node-only (pulls in the data layer); do NOT import from the edge
 * middleware — use checkAdminAuth from ./auth there instead.
 *
 * ── Tenant-scope trust model (TEMPORARY) ────────────────────────────────
 * The console is currently protected by ONE global password
 * (ADMIN_PASSWORD, see ./auth.ts). There is no per-hotel identity, so an
 * authenticated operator may act on ANY tenant: the `hotelSlug` in a
 * request BODY selects which hotel is edited — it is NOT an authorization
 * boundary and must never be trusted as one. That is acceptable only
 * because every console operator today is trusted platform staff.
 *
 * This function is the single chokepoint to tighten when Supabase Auth +
 * hotel_members roles land (decision F): resolve the caller's identity,
 * intersect it with the requested hotel's membership, and reject hotels the
 * caller has no role on. Keeping all three admin routes funneled through
 * here means that change happens in one place.
 */

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin/auth";
import { getDataSource } from "@/lib/data";
import { tenantDomainFromHost } from "@/lib/tenant/host";
import type { Hotel } from "@/lib/data/types";

export type AdminHotelResult =
  | { ok: true; hotel: Hotel }
  | { ok: false; response: NextResponse };

/**
 * Gate a console request and resolve its target hotel.
 *
 * - Rejects unauthenticated callers with the shared 401.
 * - When `hotelSlug` is given, selects that tenant; otherwise (only if
 *   `fallbackToHost`) falls back to the tenant of the request host.
 * - 404s when no matching hotel exists.
 *
 * The returned hotel is a SELECTOR result, not proof of ownership — see the
 * trust-model note above.
 */
export async function resolveAdminHotel(
  req: NextRequest,
  opts: { hotelSlug?: string; fallbackToHost?: boolean } = {},
): Promise<AdminHotelResult> {
  if (!checkAdminAuth(req)) {
    return { ok: false, response: unauthorizedResponse() as NextResponse };
  }

  const data = getDataSource();
  const slug = opts.hotelSlug?.trim();
  const hotel = slug
    ? await data.getHotelBySlug(slug)
    : opts.fallbackToHost
      ? await data.getHotelByDomain(tenantDomainFromHost(req.headers.get("host")))
      : null;

  if (!hotel) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "hotel_not_found" },
        { status: 404 },
      ),
    };
  }
  return { ok: true, hotel };
}
