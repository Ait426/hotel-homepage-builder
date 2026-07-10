/**
 * Demo adapter — a full HotelDataSource with zero external services.
 *
 * Tenants come from the in-memory registry: the built-in Aurora Bay demo
 * hotel plus any tenants generated at runtime by the onboarding wizard.
 * Availability is deterministic (hash of roomType+date) so renders are
 * stable; reservations/inquiries live in process memory (reset on restart).
 */

import type {
  AvailabilityDay,
  Hotel,
  HotelDataSource,
  InquiryInput,
  InquiryResult,
  ISODate,
  PageDef,
  RatePlan,
  ReservationInput,
  ReservationResult,
  ReservationSummary,
  RoomType,
  StayQuote,
} from "@/lib/data/types";
import {
  addDays,
  dayOfWeek,
  eachNight,
  nightsBetween,
  todayIn,
} from "@/lib/dates";
import { DEMO_HOTEL, DEMO_PAGES, DEMO_RATE_PLANS, DEMO_ROOM_TYPES } from "./content";
import {
  allBundles,
  bundleByDomain,
  bundleById,
  bundleBySlug,
  registerBundle,
  type TenantBundle,
} from "./registry";

// the built-in demo tenant is bundle #0
registerBundle({
  hotel: DEMO_HOTEL,
  roomTypes: DEMO_ROOM_TYPES,
  ratePlans: DEMO_RATE_PLANS,
  pages: DEMO_PAGES,
});

/** How far ahead the demo calendar is open for sale. */
const SALE_WINDOW_DAYS = 365;

/** FNV-1a — deterministic "randomness" per (roomType, date). */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Baseline sold count before any in-memory bookings. */
function baseSold(roomType: RoomType, date: ISODate): number {
  const h = hash(`${roomType.id}:${date}`);
  const weekend = dayOfWeek(date) === 5 || dayOfWeek(date) === 6;
  // weekends run hotter; never bake in a full sell-out so the flow is demoable
  const ceiling = weekend ? roomType.totalRooms : Math.ceil(roomType.totalRooms * 0.7);
  return roomType.totalRooms <= 1 ? 0 : h % Math.max(ceiling, 1);
}

function nightlyPrice(plan: RatePlan, date: ISODate): number {
  const weekend = dayOfWeek(date) === 5 || dayOfWeek(date) === 6;
  const price = plan.basePrice * (weekend ? 1.25 : 1);
  return Math.round(price / 1000) * 1000;
}

// --- in-memory state --------------------------------------------------------

interface DemoReservation extends ReservationSummary {
  email: string;
  hotelId: string;
}

const extraSold = new Map<string, number>(); // `${roomTypeId}:${date}` → count
const reservations = new Map<string, DemoReservation>(); // code → record
const threads: Array<{ id: string; hotelId: string; input: InquiryInput }> = [];
let reservationSeq = 0;

function soldKey(roomTypeId: string, date: ISODate): string {
  return `${roomTypeId}:${date}`;
}

function remainingFor(roomType: RoomType, date: ISODate): number {
  const sold = baseSold(roomType, date) + (extraSold.get(soldKey(roomType.id, date)) ?? 0);
  return Math.max(roomType.totalRooms - sold, 0);
}

function saleWindow(timezone: string): { from: ISODate; to: ISODate } {
  const from = todayIn(timezone);
  return { from, to: addDays(from, SALE_WINDOW_DAYS) };
}

function inSaleWindow(bundle: TenantBundle, checkIn: ISODate, checkOut: ISODate): boolean {
  const { from, to } = saleWindow(bundle.hotel.timezone);
  return checkIn >= from && checkOut <= to;
}

// --- adapter ----------------------------------------------------------------

export const demoDataSource: HotelDataSource = {
  async getHotelByDomain(domain: string): Promise<Hotel | null> {
    return bundleByDomain(domain)?.hotel ?? null;
  },

  async getHotelBySlug(slug: string): Promise<Hotel | null> {
    return bundleBySlug(slug)?.hotel ?? null;
  },

  async listHotels(): Promise<Hotel[]> {
    return allBundles().map((b) => b.hotel);
  },

  async getPage(hotelId: string, path: string): Promise<PageDef | null> {
    const bundle = bundleById(hotelId);
    if (!bundle) return null;
    return (
      bundle.pages.find((p) => p.path === path && p.status === "published") ?? null
    );
  },

  async listPublishedPages(hotelId: string): Promise<PageDef[]> {
    return bundleById(hotelId)?.pages.filter((p) => p.status === "published") ?? [];
  },

  async getRedirect(hotelId: string, fromPath: string) {
    const bundle = bundleById(hotelId);
    return bundle?.redirects?.find((r) => r.fromPath === fromPath) ?? null;
  },

  async listRoomTypes(hotelId: string): Promise<RoomType[]> {
    const bundle = bundleById(hotelId);
    if (!bundle) return [];
    return [...bundle.roomTypes]
      .filter((r) => r.status === "active")
      .sort((a, b) => a.sort - b.sort);
  },

  async getRoomTypeBySlug(hotelId: string, slug: string): Promise<RoomType | null> {
    const bundle = bundleById(hotelId);
    if (!bundle) return null;
    return (
      bundle.roomTypes.find((r) => r.slug === slug && r.status === "active") ?? null
    );
  },

  async listRatePlans(hotelId: string, roomTypeId?: string): Promise<RatePlan[]> {
    const bundle = bundleById(hotelId);
    if (!bundle) return [];
    return bundle.ratePlans.filter(
      (p) => p.status === "active" && (!roomTypeId || p.roomTypeId === roomTypeId),
    );
  },

  async getAvailability(
    hotelId: string,
    from: ISODate,
    to: ISODate,
  ): Promise<AvailabilityDay[]> {
    const bundle = bundleById(hotelId);
    if (!bundle) return [];
    const window = saleWindow(bundle.hotel.timezone);
    const start = from > window.from ? from : window.from;
    const end = to < window.to ? to : window.to;
    if (start >= end) return [];

    const days: AvailabilityDay[] = [];
    for (const roomType of bundle.roomTypes) {
      if (roomType.status !== "active") continue;
      for (const date of eachNight(start, end)) {
        days.push({
          roomTypeId: roomType.id,
          date,
          remaining: remainingFor(roomType, date),
        });
      }
    }
    return days;
  },

  async quoteStay(
    hotelId: string,
    roomTypeId: string,
    ratePlanId: string,
    checkIn: ISODate,
    checkOut: ISODate,
  ): Promise<StayQuote | null> {
    const bundle = bundleById(hotelId);
    if (!bundle) return null;
    if (nightsBetween(checkIn, checkOut) < 1) return null;
    if (!inSaleWindow(bundle, checkIn, checkOut)) return null;

    const roomType = bundle.roomTypes.find(
      (r) => r.id === roomTypeId && r.status === "active",
    );
    const plan = bundle.ratePlans.find(
      (p) => p.id === ratePlanId && p.roomTypeId === roomTypeId && p.status === "active",
    );
    if (!roomType || !plan) return null;

    let remaining = Infinity;
    const nights = eachNight(checkIn, checkOut).map((date) => {
      remaining = Math.min(remaining, remainingFor(roomType, date));
      return { date, price: nightlyPrice(plan, date) };
    });

    return {
      roomTypeId,
      ratePlanId,
      checkIn,
      checkOut,
      nights,
      remaining: Number.isFinite(remaining) ? remaining : 0,
      totalPerRoom: nights.reduce((sum, n) => sum + n.price, 0),
      currency: bundle.hotel.currency,
    };
  },

  async createReservation(
    hotelId: string,
    input: ReservationInput,
  ): Promise<ReservationResult> {
    const bundle = bundleById(hotelId);
    if (!bundle) return { ok: false, error: "hotel_not_found" };
    if (nightsBetween(input.checkIn, input.checkOut) < 1) {
      return { ok: false, error: "invalid_stay_range" };
    }
    if (!Number.isInteger(input.rooms) || input.rooms < 1) {
      return { ok: false, error: "invalid_rooms_count" };
    }
    if (!input.guest?.name?.trim() || !input.guest?.email?.trim()) {
      return { ok: false, error: "invalid_guest" };
    }
    if (!inSaleWindow(bundle, input.checkIn, input.checkOut)) {
      return { ok: false, error: "not_open_for_sale" };
    }

    const roomType = bundle.roomTypes.find((r) => r.id === input.roomTypeId);
    if (
      roomType &&
      input.adults + input.children > roomType.occupancyMax * input.rooms
    ) {
      return { ok: false, error: "invalid_guest" };
    }

    const quote = await this.quoteStay(
      hotelId,
      input.roomTypeId,
      input.ratePlanId,
      input.checkIn,
      input.checkOut,
    );
    if (!quote) return { ok: false, error: "rate_plan_not_found" };
    if (quote.remaining < input.rooms) return { ok: false, error: "sold_out" };

    const total = quote.totalPerRoom * input.rooms;
    // cent-rounded comparison: the client total is a JSON float
    if (
      input.expectedTotal !== undefined &&
      Math.round(input.expectedTotal * 100) !== Math.round(total * 100)
    ) {
      return { ok: false, error: "price_changed", detail: String(total) };
    }

    for (const night of quote.nights) {
      const key = soldKey(input.roomTypeId, night.date);
      extraSold.set(key, (extraSold.get(key) ?? 0) + input.rooms);
    }

    reservationSeq += 1;
    const code = `BK-DEMO-${String(reservationSeq).padStart(4, "0")}`;
    reservations.set(code, {
      code,
      status: "confirmed",
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      roomTypeId: input.roomTypeId,
      ratePlanId: input.ratePlanId,
      guestName: input.guest.name,
      amountTotal: total,
      currency: quote.currency,
      email: input.guest.email.toLowerCase(),
      hotelId,
    });

    return {
      ok: true,
      reservationId: code,
      code,
      amountTotal: total,
      currency: quote.currency,
    };
  },

  async getReservation(
    hotelId: string,
    code: string,
    email: string,
  ): Promise<ReservationSummary | null> {
    const record = reservations.get(code);
    if (!record || record.hotelId !== hotelId) return null;
    if (record.email !== email.toLowerCase()) return null;
    const { email: _email, hotelId: _hotelId, ...summary } = record;
    return summary;
  },

  async createInquiry(hotelId: string, input: InquiryInput): Promise<InquiryResult> {
    if (!bundleById(hotelId)) return { ok: false, error: "unknown" };
    if (!input.guest?.name?.trim() || !input.guest?.email?.trim() || !input.body?.trim()) {
      return { ok: false, error: "invalid_input" };
    }
    const id = `thread-demo-${threads.length + 1}`;
    threads.push({ id, hotelId, input });
    return { ok: true, threadId: id };
  },
};
