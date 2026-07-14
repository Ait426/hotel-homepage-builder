import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/lib/data";
import type { ReservationErrorCode } from "@/lib/data/types";
import { isValidISODate, nightsBetween, todayIn } from "@/lib/dates";
import { tenantDomainFromHost } from "@/lib/tenant/host";

/**
 * Map a reservation failure to an HTTP status by CLASS of problem:
 *  400 the request itself is malformed (bad dates/rooms/guests)
 *  404 a referenced entity doesn't exist (hotel / rate plan)
 *  409 the request is well-formed but conflicts with current server state
 *      (sold out, closed, min-stay, price moved) — retrying as-is won't help
 *  500 an unexpected server/DB fault
 * Lumping all of these into one code hid real distinctions from API clients.
 */
function reservationHttpStatus(error: ReservationErrorCode): number {
  switch (error) {
    case "invalid_stay_range":
    case "invalid_rooms_count":
    case "invalid_guest":
      return 400;
    case "hotel_not_found":
    case "rate_plan_not_found":
    case "reservation_not_found":
      return 404;
    case "sold_out":
    case "closed_for_sale":
    case "min_stay_not_met":
    case "not_open_for_sale":
    case "price_changed":
    case "not_cancellable":
      return 409;
    case "unknown":
    default:
      return 500;
  }
}

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

  // cheap first-line guards; the data source (RPC/adapter) re-validates
  const { checkIn, checkOut } = parsed.data;
  if (
    checkIn < todayIn(hotel.timezone) ||
    nightsBetween(checkIn, checkOut) < 1 ||
    nightsBetween(checkIn, checkOut) > 30
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_stay_range" },
      { status: 400 },
    );
  }

  const result = await getDataSource().createReservation(hotel.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json(result, { status: reservationHttpStatus(result.error) });
  }
  return NextResponse.json(result, { status: 201 });
}
