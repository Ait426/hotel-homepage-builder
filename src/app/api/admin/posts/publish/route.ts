import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin/auth";
import { getDataSource } from "@/lib/data";

/** POST /api/admin/posts/publish — 초안 검수 후 발행 */

const bodySchema = z.object({
  hotelSlug: z.string().trim().min(1).max(60),
  postId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return unauthorizedResponse();

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const data = getDataSource();
  const hotel = await data.getHotelBySlug(parsed.data.hotelSlug);
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "hotel_not_found" }, { status: 404 });
  }

  const ok = await data.publishPost(hotel.id, parsed.data.postId);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: "post_not_found" }, { status: 404 });
}
