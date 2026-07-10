import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/lib/data";
import { isValidISODate } from "@/lib/dates";
import { tenantDomainFromHost } from "@/lib/tenant/host";

/**
 * POST /api/reservations — direct-booking write path.
 * Tenant comes from the request host (API routes bypass the middleware
 * rewrite). Input is re-validated here; price + inventory are re-verified
 * inside the data source (RPC create_reservation for Supabase).
 */

const bodySchema = z.object({
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1),
  checkIn: z.string().refine(isValidISODate, "invalid date"),
  checkOut: z.string().refine(isValidISODate, "invalid date"),
  rooms: z.number().int().min(1).max(5),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  expectedTotal: z.number().nonnegative().optional(),
  guest: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional(),
    locale: z.string().max(10).optional(),
    requests: z.string().trim().max(1000).optional(),
  }),
});

export async function POST(req: NextRequest) {
  const domain = tenantDomainFromHost(req.headers.get("host"));
  const hotel = await getDataSource().getHotelByDomain(domain);
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "hotel_not_found" }, { status: 404 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_guest" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_guest" }, { status: 400 });
  }

  const result = await getDataSource().createReservation(hotel.id, parsed.data);
  if (!result.ok) {
    const status = result.error === "unknown" ? 500 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result, { status: 201 });
}
