/**
 * Stay pricing — the ONE definition of how a nightly-rate stay becomes a
 * charge. Both adapters (demo in-memory, Supabase quoteStay) call this so the
 * quoted total the guest sees matches what gets booked; the Supabase
 * create_reservation RPC re-implements the SAME math in SQL (it is the final
 * arbiter and re-checks the quoted total). Keep the three in lockstep — any
 * change here must land in supabase/migrations create_reservation too, or
 * bookings start bouncing with price_changed.
 *
 * Model:
 *   roomSubtotal   = Σ nightly base prices × rooms
 *   extraGuestFee  = guests beyond (occupancyBase × rooms), each × fee × nights
 *   subtotal       = roomSubtotal + extraGuestTotal
 *   discount       = best-matching AUTOMATIC promotion applied to subtotal
 *   total          = max(0, subtotal − discount)
 *
 * Only automatic promotions (code === null) apply here. Code promotions are
 * redeemed explicitly and are never auto-applied to a quote.
 */

export interface PricingPromotion {
  id: string;
  /** null = automatic; a code promo is redeemed explicitly, never auto-applied */
  code: string | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  minNights: number;
  minAdvanceDays?: number | null;
  maxAdvanceDays?: number | null;
  /** inclusive ISO date bounds on the stay's check-in (null = unbounded) */
  stayFrom?: string | null;
  stayTo?: string | null;
  /** null = all room types */
  roomTypeIds?: string[] | null;
  status: string;
}

export interface StayPricingInput {
  /** per-room base price for each night of the stay */
  nightlyPrices: number[];
  rooms: number;
  occupancyBase: number;
  extraGuestFee: number;
  adults: number;
  children: number;
  roomTypeId: string;
  /** stay check-in, ISO date (YYYY-MM-DD) */
  checkIn: string;
  /** hotel-local "today", ISO date — for advance-purchase promo windows */
  today: string;
  promotions: PricingPromotion[];
}

export interface StayPricing {
  roomSubtotal: number;
  extraGuestTotal: number;
  subtotal: number;
  discountAmount: number;
  promotionId: string | null;
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** whole days from `from` to `to` (both ISO dates); negative if `to` precedes */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** does this promotion apply to the given stay? (automatic promos only) */
export function promotionApplies(
  promo: PricingPromotion,
  ctx: { roomTypeId: string; nights: number; advanceDays: number; checkIn: string },
): boolean {
  if (promo.status !== "active" || promo.code !== null) return false;
  if (promo.roomTypeIds && !promo.roomTypeIds.includes(ctx.roomTypeId)) return false;
  if (ctx.nights < promo.minNights) return false;
  if (promo.minAdvanceDays != null && ctx.advanceDays < promo.minAdvanceDays) return false;
  if (promo.maxAdvanceDays != null && ctx.advanceDays > promo.maxAdvanceDays) return false;
  if (promo.stayFrom && ctx.checkIn < promo.stayFrom) return false;
  if (promo.stayTo && ctx.checkIn > promo.stayTo) return false;
  return true;
}

/** discount a promo yields on `subtotal` (percent or flat amount, capped) */
function promotionDiscount(promo: PricingPromotion, subtotal: number): number {
  if (promo.discountPercent != null) {
    // Compute the percent discount in integer minor units so this matches
    // Postgres round(numeric, 2) (exact-decimal, half away from zero) EXACTLY.
    // A binary-float multiply + round2 disagrees on half-cents — e.g.
    // 100.75 × 10% = 10.075, which round2 sends to 10.07 but Postgres to 10.08
    // — and the create_reservation RPC would then reject the (correct) quoted
    // total with price_changed on any cents-bearing currency. subtotal is
    // already 2dp and discount_percent is numeric(5,2), so both scale to exact
    // integers; numer = subtotalMinor × pctMinor = discount × 10000.
    const subtotalMinor = Math.round(subtotal * 100);
    const pctMinor = Math.round(promo.discountPercent * 100);
    const numer = subtotalMinor * pctMinor;
    const whole = Math.floor(numer / 10000);
    const rem = numer % 10000;
    const discountMinor = rem * 2 >= 10000 ? whole + 1 : whole;
    return discountMinor / 100;
  }
  if (promo.discountAmount != null) {
    return round2(Math.min(promo.discountAmount, subtotal));
  }
  return 0;
}

/**
 * Best automatic promotion for a stay: the applicable one giving the largest
 * discount. Returns null discount/id when none apply.
 */
export function selectPromotion(
  subtotal: number,
  input: Pick<StayPricingInput, "promotions" | "roomTypeId" | "checkIn" | "today"> & {
    nights: number;
  },
): { promotionId: string | null; discountAmount: number } {
  const advanceDays = daysBetween(input.today, input.checkIn);
  let best: { promotionId: string; discountAmount: number } | null = null;
  for (const promo of input.promotions) {
    if (
      !promotionApplies(promo, {
        roomTypeId: input.roomTypeId,
        nights: input.nights,
        advanceDays,
        checkIn: input.checkIn,
      })
    ) {
      continue;
    }
    const discount = promotionDiscount(promo, subtotal);
    // largest discount wins; ties broken by smallest id so the recorded
    // promotion_id matches the RPC's `order by discount desc, id asc`
    if (
      discount > 0 &&
      (!best ||
        discount > best.discountAmount ||
        (discount === best.discountAmount && promo.id < best.promotionId))
    ) {
      best = { promotionId: promo.id, discountAmount: discount };
    }
  }
  return best ?? { promotionId: null, discountAmount: 0 };
}

export function priceStay(input: StayPricingInput): StayPricing {
  const nights = input.nightlyPrices.length;
  const roomSubtotal = round2(
    input.nightlyPrices.reduce((sum, p) => sum + p, 0) * input.rooms,
  );

  const extraGuests = Math.max(
    0,
    input.adults + input.children - input.occupancyBase * input.rooms,
  );
  const extraGuestTotal = round2(extraGuests * input.extraGuestFee * nights);

  const subtotal = round2(roomSubtotal + extraGuestTotal);
  const { promotionId, discountAmount } = selectPromotion(subtotal, {
    promotions: input.promotions,
    roomTypeId: input.roomTypeId,
    checkIn: input.checkIn,
    today: input.today,
    nights,
  });

  return {
    roomSubtotal,
    extraGuestTotal,
    subtotal,
    discountAmount,
    promotionId,
    total: round2(Math.max(0, subtotal - discountAmount)),
  };
}
