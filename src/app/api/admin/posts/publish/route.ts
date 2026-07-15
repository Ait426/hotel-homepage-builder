import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdminHotel } from "@/lib/admin/console";
import { getDataSource } from "@/lib/data";

/** POST /api/admin/posts/publish — 초안 검수 후 발행 */

const bodySchema = z.object({
  hotelSlug: z.string().trim().min(1).max(60),
  postId: z.string().min(1),
});

export async function POST(req: NextRequest) {
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
  const ok = await data.publishPost(hotel.id, parsed.data.postId);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: "post_not_found" }, { status: 404 });
}
