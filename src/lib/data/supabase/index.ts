/**
 * Supabase adapter — maps DB rows to domain types and delegates booking
 * writes to the concurrency-safe RPCs (create_reservation /
 * cancel_reservation own the inventory ledger; this layer never mutates
 * room_inventory directly).
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
  ReservationErrorCode,
  ReservationInput,
  ReservationResult,
  ReservationSummary,
  RoomType,
  StayQuote,
} from "@/lib/data/types";
import { eachNight, nightsBetween } from "@/lib/dates";
import { getAnonClient, getServiceClient } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function mapHotel(row: Row, primaryDomain: string): Hotel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name ?? {},
    propertyType: row.property_type ?? "hotel",
    defaultLocale: row.default_locale,
    locales: row.locales ?? [row.default_locale],
    currency: row.currency,
    timezone: row.timezone,
    theme: row.theme ?? {},
    contact: row.contact ?? {},
    seo: row.seo ?? {},
    status: row.status,
    primaryDomain,
  };
}

function mapRoomType(row: Row): RoomType {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    slug: row.slug,
    code: row.code,
    sort: row.sort ?? 0,
    content: row.content ?? {},
    images: row.images ?? [],
    amenities: row.amenities ?? [],
    sizeSqm: row.size_sqm != null ? Number(row.size_sqm) : undefined,
    occupancyBase: row.occupancy_base,
    occupancyMax: row.occupancy_max,
    totalRooms: row.total_rooms,
    status: row.status,
  };
}

function mapRatePlan(row: Row): RatePlan {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    roomTypeId: row.room_type_id,
    code: row.code,
    name: row.name ?? {},
    mealPlan: row.meal_plan,
    cancellationPolicy: row.cancellation_policy ?? {},
    basePrice: Number(row.base_price),
    status: row.status,
  };
}

function mapPost(row: Row): import("@/lib/data/types").PostDef {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    slug: row.slug,
    kind: row.kind,
    title: row.title ?? {},
    excerpt: row.excerpt ?? {},
    coverImage: row.cover_image ?? undefined,
    bodySections: Array.isArray(row.body_sections) ? row.body_sections : [],
    status: row.status,
    publishedAt: row.published_at ?? undefined,
  };
}

function mapPage(row: Row): PageDef {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    path: row.path,
    kind: row.kind,
    sections: Array.isArray(row.sections) ? row.sections : [],
    seo: row.seo ?? {},
    status: row.status,
  };
}

const KNOWN_ERRORS: ReservationErrorCode[] = [
  "invalid_stay_range",
  "invalid_rooms_count",
  "invalid_guest",
  "hotel_not_found",
  "rate_plan_not_found",
  "sold_out",
  "closed_for_sale",
  "min_stay_not_met",
  "not_open_for_sale",
  "price_changed",
  "reservation_not_found",
  "not_cancellable",
];

function mapRpcError(message: string | undefined): ReservationErrorCode {
  if (!message) return "unknown";
  return KNOWN_ERRORS.find((code) => message.includes(code)) ?? "unknown";
}

async function primaryDomainFor(hotelId: string): Promise<string> {
  const { data } = await getAnonClient()
    .from("hotel_domains")
    .select("domain, is_primary")
    .eq("hotel_id", hotelId)
    .order("is_primary", { ascending: false })
    .limit(1);
  return data?.[0]?.domain ?? "";
}

class SupabaseDataSource implements HotelDataSource {
  async getHotelByDomain(domain: string): Promise<Hotel | null> {
    const { data, error } = await getAnonClient()
      .from("hotel_domains")
      .select("domain, hotels(*)")
      .eq("domain", domain)
      .maybeSingle();
    if (error || !data?.hotels) return null;
    const hotel = data.hotels as unknown as Row;
    if (hotel.status !== "live") return null;
    return mapHotel(hotel, await primaryDomainFor(hotel.id));
  }

  async getHotelBySlug(slug: string): Promise<Hotel | null> {
    const { data, error } = await getAnonClient()
      .from("hotels")
      .select("*")
      .eq("slug", slug)
      .eq("status", "live")
      .maybeSingle();
    if (error || !data) return null;
    return mapHotel(data, await primaryDomainFor(data.id));
  }

  async listHotels(): Promise<Hotel[]> {
    const { data } = await getAnonClient()
      .from("hotels")
      .select("*")
      .eq("status", "live");
    if (!data) return [];
    return Promise.all(
      data.map(async (row) => mapHotel(row, await primaryDomainFor(row.id))),
    );
  }

  async getPage(hotelId: string, path: string): Promise<PageDef | null> {
    const { data } = await getAnonClient()
      .from("pages")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("path", path)
      .eq("status", "published")
      .maybeSingle();
    return data ? mapPage(data) : null;
  }

  async listPublishedPages(hotelId: string): Promise<PageDef[]> {
    const { data } = await getAnonClient()
      .from("pages")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("status", "published");
    return (data ?? []).map(mapPage);
  }

  async getRedirect(hotelId: string, fromPath: string) {
    const { data } = await getAnonClient()
      .from("redirects")
      .select("from_path, to_path, status_code")
      .eq("hotel_id", hotelId)
      .eq("from_path", fromPath)
      .maybeSingle();
    if (!data) return null;
    return {
      fromPath: data.from_path,
      toPath: data.to_path,
      statusCode: data.status_code as 301 | 302 | 308,
    };
  }

  async listPosts(hotelId: string) {
    const { data } = await getAnonClient()
      .from("posts")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    return (data ?? []).map(mapPost);
  }

  async getPostBySlug(hotelId: string, slug: string) {
    const { data } = await getAnonClient()
      .from("posts")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();
    return data ? mapPost(data) : null;
  }

  async listAllPosts(hotelId: string) {
    const { data } = await getServiceClient()
      .from("posts")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapPost);
  }

  async publishPost(hotelId: string, postId: string) {
    const { error } = await getServiceClient()
      .from("posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
      .eq("id", postId);
    return !error;
  }

  async listReservations(hotelId: string) {
    const { data } = await getServiceClient()
      .from("reservations")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data ?? []).map((row) => ({
      code: row.code,
      status: row.status,
      checkIn: row.check_in,
      checkOut: row.check_out,
      rooms: row.rooms_count,
      roomTypeId: row.room_type_id,
      ratePlanId: row.rate_plan_id,
      guestName: row.guest?.name ?? "",
      amountTotal: Number(row.amount_total),
      currency: row.currency,
    }));
  }

  async updateRatePlan(hotelId: string, ratePlanId: string, patch: { basePrice: number }) {
    const { error } = await getServiceClient()
      .from("rate_plans")
      .update({ base_price: patch.basePrice })
      .eq("hotel_id", hotelId)
      .eq("id", ratePlanId);
    return !error;
  }

  async updateRoomType(
    hotelId: string,
    roomTypeId: string,
    patch: { totalRooms?: number; occupancyMax?: number },
  ) {
    const update: Record<string, number> = {};
    if (patch.totalRooms !== undefined) update.total_rooms = patch.totalRooms;
    if (patch.occupancyMax !== undefined) update.occupancy_max = patch.occupancyMax;
    if (Object.keys(update).length === 0) return true;
    // NOTE: room_inventory rows keep their per-date totals; the full console
    // ships a ledger re-sync tool. This updates the sellable default only.
    const { error } = await getServiceClient()
      .from("room_types")
      .update(update)
      .eq("hotel_id", hotelId)
      .eq("id", roomTypeId);
    return !error;
  }

  async listRoomTypes(hotelId: string): Promise<RoomType[]> {
    const { data } = await getAnonClient()
      .from("room_types")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("status", "active")
      .order("sort");
    return (data ?? []).map(mapRoomType);
  }

  async getRoomTypeBySlug(hotelId: string, slug: string): Promise<RoomType | null> {
    const { data } = await getAnonClient()
      .from("room_types")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    return data ? mapRoomType(data) : null;
  }

  async listRatePlans(hotelId: string, roomTypeId?: string): Promise<RatePlan[]> {
    let query = getAnonClient()
      .from("rate_plans")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("status", "active");
    if (roomTypeId) query = query.eq("room_type_id", roomTypeId);
    const { data } = await query;
    return (data ?? []).map(mapRatePlan);
  }

  async getAvailability(
    hotelId: string,
    from: ISODate,
    to: ISODate,
  ): Promise<AvailabilityDay[]> {
    const { data } = await getAnonClient()
      .from("room_availability")
      .select("room_type_id, date, remaining")
      .eq("hotel_id", hotelId)
      .gte("date", from)
      .lt("date", to);
    return (data ?? []).map((row) => ({
      roomTypeId: row.room_type_id,
      date: row.date,
      remaining: row.remaining,
    }));
  }

  async quoteStay(
    hotelId: string,
    roomTypeId: string,
    ratePlanId: string,
    checkIn: ISODate,
    checkOut: ISODate,
  ): Promise<StayQuote | null> {
    const nightsCount = nightsBetween(checkIn, checkOut);
    if (nightsCount < 1) return null;

    const [plans, availability, ratesRes, hotelRes] = await Promise.all([
      this.listRatePlans(hotelId, roomTypeId),
      this.getAvailability(hotelId, checkIn, checkOut),
      getAnonClient()
        .from("daily_rates")
        .select("date, price, closed, min_stay")
        .eq("hotel_id", hotelId)
        .eq("rate_plan_id", ratePlanId)
        .gte("date", checkIn)
        .lt("date", checkOut),
      getAnonClient().from("hotels").select("currency").eq("id", hotelId).maybeSingle(),
    ]);

    const plan = plans.find((p) => p.id === ratePlanId);
    if (!plan || !hotelRes.data) return null;

    const remainingByDate = new Map(
      availability
        .filter((a) => a.roomTypeId === roomTypeId)
        .map((a) => [a.date, a.remaining]),
    );
    const rateByDate = new Map(
      (ratesRes.data ?? []).map((r) => [r.date as string, r]),
    );

    let remaining = Infinity;
    const nights = [];
    for (const date of eachNight(checkIn, checkOut)) {
      const dayRemaining = remainingByDate.get(date);
      // no ledger row = not open for sale
      if (dayRemaining === undefined) return null;
      const rate = rateByDate.get(date);
      if (rate?.closed) return null;
      if (rate && rate.min_stay > nightsCount) return null;
      remaining = Math.min(remaining, dayRemaining);
      nights.push({ date, price: rate ? Number(rate.price) : plan.basePrice });
    }

    return {
      roomTypeId,
      ratePlanId,
      checkIn,
      checkOut,
      nights,
      remaining: Number.isFinite(remaining) ? remaining : 0,
      totalPerRoom: nights.reduce((sum, n) => sum + n.price, 0),
      currency: hotelRes.data.currency,
    };
  }

  async createReservation(
    hotelId: string,
    input: ReservationInput,
  ): Promise<ReservationResult> {
    const { data, error } = await getServiceClient().rpc("create_reservation", {
      p_hotel_id: hotelId,
      p_room_type_id: input.roomTypeId,
      p_rate_plan_id: input.ratePlanId,
      p_check_in: input.checkIn,
      p_check_out: input.checkOut,
      p_rooms: input.rooms,
      p_adults: input.adults,
      p_children: input.children,
      p_guest: {
        name: input.guest.name,
        email: input.guest.email,
        phone: input.guest.phone ?? null,
        locale: input.guest.locale ?? null,
        requests: input.guest.requests ?? null,
      },
      p_expected_total: input.expectedTotal ?? null,
    });

    if (error) {
      return { ok: false, error: mapRpcError(error.message) };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: false, error: "unknown" };
    return {
      ok: true,
      reservationId: row.reservation_id,
      code: row.code,
      amountTotal: Number(row.amount_total),
      currency: row.currency,
    };
  }

  async getReservation(
    hotelId: string,
    code: string,
    email: string,
  ): Promise<ReservationSummary | null> {
    const { data } = await getServiceClient()
      .from("reservations")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("code", code)
      .maybeSingle();
    if (!data) return null;
    const guestEmail = String(data.guest?.email ?? "").toLowerCase();
    if (guestEmail !== email.toLowerCase()) return null;
    return {
      code: data.code,
      status: data.status,
      checkIn: data.check_in,
      checkOut: data.check_out,
      rooms: data.rooms_count,
      roomTypeId: data.room_type_id,
      ratePlanId: data.rate_plan_id,
      guestName: data.guest?.name ?? "",
      amountTotal: Number(data.amount_total),
      currency: data.currency,
    };
  }

  async createInquiry(hotelId: string, input: InquiryInput): Promise<InquiryResult> {
    if (!input.guest?.name?.trim() || !input.guest?.email?.trim() || !input.body?.trim()) {
      return { ok: false, error: "invalid_input" };
    }
    const service = getServiceClient();

    let reservationId: string | null = null;
    if (input.reservationCode) {
      const { data } = await service
        .from("reservations")
        .select("id")
        .eq("hotel_id", hotelId)
        .eq("code", input.reservationCode)
        .maybeSingle();
      reservationId = data?.id ?? null;
    }

    const { data: thread, error: threadError } = await service
      .from("threads")
      .insert({
        hotel_id: hotelId,
        reservation_id: reservationId,
        channel: "webform",
        subject: input.subject ?? null,
        guest: {
          name: input.guest.name,
          email: input.guest.email,
          phone: input.guest.phone ?? null,
          locale: input.guest.locale ?? null,
        },
      })
      .select("id")
      .single();
    if (threadError || !thread) return { ok: false, error: "unknown" };

    const { error: messageError } = await service.from("messages").insert({
      thread_id: thread.id,
      hotel_id: hotelId,
      sender: "guest",
      body: input.body,
    });
    if (messageError) return { ok: false, error: "unknown" };

    return { ok: true, threadId: thread.id };
  }
}

let instance: SupabaseDataSource | null = null;

export function getSupabaseDataSource(): HotelDataSource {
  if (!instance) instance = new SupabaseDataSource();
  return instance;
}
