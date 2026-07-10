/**
 * Domain types — the contract between routes/sections and the data layer.
 * Mirrors supabase/migrations/*.sql. Keep the two in sync.
 */

import type { Localized } from "@/lib/i18n/locales";

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  colors?: {
    /** primary brand color (buttons, links) */
    brand?: string;
    /** readable text color on top of brand */
    brandInk?: string;
    /** secondary accent (badges, highlights) */
    accent?: string;
    /** page background */
    canvas?: string;
    /** card / panel background */
    surface?: string;
    /** main text */
    ink?: string;
    /** secondary text */
    inkMuted?: string;
  };
  fonts?: {
    /** display stack for headings */
    display?: string;
    /** body text stack */
    body?: string;
  };
  /** base border radius, e.g. "0.75rem" (0 = sharp luxury look) */
  radius?: string;
}

export interface HotelContact {
  phone?: string;
  email?: string;
  address?: Localized<string>;
  geo?: { lat: number; lng: number };
  checkIn?: string;
  checkOut?: string;
}

export interface HotelSeo {
  title?: Localized<string>;
  description?: Localized<string>;
  ogImage?: string;
}

export interface Hotel {
  id: string;
  slug: string;
  name: Localized<string>;
  defaultLocale: string;
  locales: string[];
  currency: string;
  timezone: string;
  theme: ThemeTokens;
  contact: HotelContact;
  seo: HotelSeo;
  status: "draft" | "live" | "suspended";
  /** primary domain — canonical origin for SEO */
  primaryDomain: string;
}

// ---------------------------------------------------------------------------
// CMS
// ---------------------------------------------------------------------------

/**
 * One section on a page (decision B). `version` pins the prop schema of
 * `type`; the registry keeps every published version renderable.
 */
export interface SectionInstance {
  id: string;
  type: string;
  version: number;
  props: Record<string, unknown>;
}

export interface PageSeo {
  title?: string;
  description?: string;
  ogImage?: string;
}

export interface PageDef {
  id: string;
  hotelId: string;
  /** '/' for home, '/about', '/facilities/spa' … */
  path: string;
  kind: "home" | "custom";
  sections: SectionInstance[];
  seo: Localized<PageSeo>;
  status: "draft" | "published" | "archived";
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export interface RoomImage {
  url: string;
  alt?: Localized<string>;
}

export interface RoomTypeContent {
  name?: string;
  tagline?: string;
  description?: string;
}

export interface RoomType {
  id: string;
  hotelId: string;
  slug: string;
  code: string;
  sort: number;
  content: Localized<RoomTypeContent>;
  images: RoomImage[];
  amenities: string[];
  sizeSqm?: number;
  occupancyBase: number;
  occupancyMax: number;
  totalRooms: number;
  status: "active" | "hidden";
}

export interface CancellationPolicy {
  freeUntilDaysBefore?: number;
  penaltyPercent?: number;
  text?: Localized<string>;
}

export interface RatePlan {
  id: string;
  hotelId: string;
  roomTypeId: string;
  code: string;
  name: Localized<string>;
  mealPlan: "room_only" | "breakfast" | "half_board" | "full_board";
  cancellationPolicy: CancellationPolicy;
  basePrice: number;
  status: "active" | "hidden";
}

/** yyyy-mm-dd (hotel-local calendar date) */
export type ISODate = string;

export interface AvailabilityDay {
  roomTypeId: string;
  date: ISODate;
  remaining: number;
}

export interface StayNight {
  date: ISODate;
  price: number;
}

/** A bookable offer for a (roomType, ratePlan, stay) combination. */
export interface StayQuote {
  roomTypeId: string;
  ratePlanId: string;
  checkIn: ISODate;
  checkOut: ISODate;
  nights: StayNight[];
  /** minimum remaining across the stay */
  remaining: number;
  /** total for one room across the whole stay */
  totalPerRoom: number;
  currency: string;
}

export interface GuestInfo {
  name: string;
  email: string;
  phone?: string;
  locale?: string;
  requests?: string;
}

export interface ReservationInput {
  roomTypeId: string;
  ratePlanId: string;
  checkIn: ISODate;
  checkOut: ISODate;
  rooms: number;
  adults: number;
  children: number;
  guest: GuestInfo;
  /** client-side quoted total; server re-verifies and rejects on mismatch */
  expectedTotal?: number;
}

export type ReservationErrorCode =
  | "invalid_stay_range"
  | "invalid_rooms_count"
  | "invalid_guest"
  | "hotel_not_found"
  | "rate_plan_not_found"
  | "sold_out"
  | "closed_for_sale"
  | "min_stay_not_met"
  | "not_open_for_sale"
  | "price_changed"
  | "reservation_not_found"
  | "not_cancellable"
  | "unknown";

export type ReservationResult =
  | {
      ok: true;
      reservationId: string;
      code: string;
      amountTotal: number;
      currency: string;
    }
  | { ok: false; error: ReservationErrorCode; detail?: string };

export interface ReservationSummary {
  code: string;
  status: string;
  checkIn: ISODate;
  checkOut: ISODate;
  rooms: number;
  roomTypeId: string;
  ratePlanId: string;
  guestName: string;
  amountTotal: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface InquiryInput {
  guest: GuestInfo;
  subject?: string;
  body: string;
  reservationCode?: string;
}

export type InquiryResult =
  | { ok: true; threadId: string }
  | { ok: false; error: "invalid_input" | "unknown" };

// ---------------------------------------------------------------------------
// Data source — implemented by the demo adapter (in-memory) and the
// Supabase adapter. Routes/sections depend only on this interface.
// ---------------------------------------------------------------------------

export interface HotelDataSource {
  getHotelByDomain(domain: string): Promise<Hotel | null>;
  getHotelBySlug(slug: string): Promise<Hotel | null>;
  /** for the platform root page / demo listing */
  listHotels(): Promise<Hotel[]>;

  getPage(hotelId: string, path: string): Promise<PageDef | null>;
  listPublishedPages(hotelId: string): Promise<PageDef[]>;

  listRoomTypes(hotelId: string): Promise<RoomType[]>;
  getRoomTypeBySlug(hotelId: string, slug: string): Promise<RoomType | null>;
  listRatePlans(hotelId: string, roomTypeId?: string): Promise<RatePlan[]>;

  getAvailability(
    hotelId: string,
    from: ISODate,
    to: ISODate,
  ): Promise<AvailabilityDay[]>;

  /** null when the stay can't be quoted (no rows open, closed, sold out) */
  quoteStay(
    hotelId: string,
    roomTypeId: string,
    ratePlanId: string,
    checkIn: ISODate,
    checkOut: ISODate,
  ): Promise<StayQuote | null>;

  createReservation(
    hotelId: string,
    input: ReservationInput,
  ): Promise<ReservationResult>;

  getReservation(
    hotelId: string,
    code: string,
    email: string,
  ): Promise<ReservationSummary | null>;

  createInquiry(hotelId: string, input: InquiryInput): Promise<InquiryResult>;
}
