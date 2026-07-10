/**
 * Supabase persistence for wizard output — the production path of
 * "도메인만 있으면 몇 시간 안에 완성".
 *
 * Demo mode registers bundles in memory; this writes them as real tenant
 * rows (service role): hotel → domain → rooms → plans → home page →
 * redirects → 365 nights of inventory. Any failure rolls back by deleting
 * the hotel (everything cascades).
 */

import "server-only";

import { getServiceClient } from "@/lib/data/supabase/client";
import { addDays, todayIn } from "@/lib/dates";
import type { GeneratedBundle } from "./generate";

const SALE_WINDOW_DAYS = 365;
const INSERT_CHUNK = 500;

export async function persistBundle(
  bundle: GeneratedBundle,
): Promise<{ ok: true; domain: string } | { ok: false; error: string }> {
  const service = getServiceClient();
  const { hotel, roomTypes, ratePlans, pages, redirects } = bundle;

  const apex = process.env.PLATFORM_APEX_DOMAIN;
  const domain = apex ? `${hotel.slug}.${apex}` : hotel.primaryDomain;

  try {
    const { error: hotelError } = await service.from("hotels").insert({
      id: hotel.id,
      slug: hotel.slug,
      name: hotel.name,
      default_locale: hotel.defaultLocale,
      locales: hotel.locales,
      currency: hotel.currency,
      timezone: hotel.timezone,
      theme: hotel.theme,
      contact: hotel.contact,
      seo: hotel.seo,
      status: "live",
    });
    if (hotelError) throw new Error(`hotels: ${hotelError.message}`);

    const { error: domainError } = await service.from("hotel_domains").insert({
      hotel_id: hotel.id,
      domain,
      is_primary: true,
      verified_at: new Date().toISOString(),
    });
    if (domainError) throw new Error(`hotel_domains: ${domainError.message}`);

    const { error: roomsError } = await service.from("room_types").insert(
      roomTypes.map((room) => ({
        id: room.id,
        hotel_id: hotel.id,
        slug: room.slug,
        code: room.code,
        sort: room.sort,
        content: room.content,
        images: room.images,
        amenities: room.amenities,
        size_sqm: room.sizeSqm ?? null,
        occupancy_base: room.occupancyBase,
        occupancy_max: room.occupancyMax,
        total_rooms: room.totalRooms,
        status: room.status,
      })),
    );
    if (roomsError) throw new Error(`room_types: ${roomsError.message}`);

    const { error: plansError } = await service.from("rate_plans").insert(
      ratePlans.map((plan) => ({
        id: plan.id,
        hotel_id: hotel.id,
        room_type_id: plan.roomTypeId,
        code: plan.code,
        name: plan.name,
        meal_plan: plan.mealPlan,
        cancellation_policy: plan.cancellationPolicy,
        base_price: plan.basePrice,
        status: plan.status,
      })),
    );
    if (plansError) throw new Error(`rate_plans: ${plansError.message}`);

    const { error: pagesError } = await service.from("pages").insert(
      pages.map((page) => ({
        id: page.id,
        hotel_id: hotel.id,
        path: page.path,
        kind: page.kind,
        sections: page.sections,
        seo: page.seo,
        status: "published",
        published_at: new Date().toISOString(),
      })),
    );
    if (pagesError) throw new Error(`pages: ${pagesError.message}`);

    if (redirects.length > 0) {
      const { error: redirectsError } = await service.from("redirects").insert(
        redirects.map((rule) => ({
          hotel_id: hotel.id,
          from_path: rule.fromPath,
          to_path: rule.toPath,
          status_code: rule.statusCode,
        })),
      );
      if (redirectsError) throw new Error(`redirects: ${redirectsError.message}`);
    }

    // open the first year of the ledger
    const start = todayIn(hotel.timezone);
    const rows: Array<Record<string, unknown>> = [];
    for (const room of roomTypes) {
      for (let i = 0; i < SALE_WINDOW_DAYS; i++) {
        rows.push({
          hotel_id: hotel.id,
          room_type_id: room.id,
          date: addDays(start, i),
          total: room.totalRooms,
        });
      }
    }
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error: invError } = await service
        .from("room_inventory")
        .insert(rows.slice(i, i + INSERT_CHUNK));
      if (invError) throw new Error(`room_inventory: ${invError.message}`);
    }

    return { ok: true, domain };
  } catch (error) {
    // roll back: hotels delete cascades domains/rooms/plans/pages/redirects/inventory
    await service.from("hotels").delete().eq("id", hotel.id);
    const message = error instanceof Error ? error.message : "unknown";
    console.error(`[onboarding] persist failed, rolled back ${hotel.slug}:`, message);
    return { ok: false, error: message };
  }
}
