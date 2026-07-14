import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdminHotel } from "@/lib/admin/console";
import { getDataSource } from "@/lib/data";

/** PATCH /api/admin/rooms — 콘솔 검수: 객실 수·최대 인원·요금제 기본가 */

const bodySchema = z.object({
  hotelSlug: z.string().trim().min(1).max(60),
  roomTypeId: z.string().min(1),
  totalRooms: z.number().int().min(0).max(500).optional(),
  occupancyMax: z.number().int().min(1).max(20).optional(),
  plans: z
    .array(
      z.object({
        id: z.string().min(1),
        basePrice: z.number().min(0).max(100_000_000),
      }),
    )
    .max(20)
    .optional(),
});

export async function PATCH(req: NextRequest) {
  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  // auth + tenant scope. hotelSlug SELECTS the tenant; under the single
  // console password it is not an ownership boundary (see resolveAdminHotel).
  const auth = await resolveAdminHotel(req, { hotelSlug: parsed.data.hotelSlug });
  if (!auth.ok) return auth.response;
  const { hotel } = auth;

  const data = getDataSource();
  const roomOk = await data.updateRoomType(hotel.id, parsed.data.roomTypeId, {
    totalRooms: parsed.data.totalRooms,
    occupancyMax: parsed.data.occupancyMax,
  });

  let plansOk = true;
  for (const plan of parsed.data.plans ?? []) {
    const ok = await data.updateRatePlan(hotel.id, plan.id, {
      basePrice: plan.basePrice,
    });
    plansOk = plansOk && ok;
  }

  if (!roomOk || !plansOk) {
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
