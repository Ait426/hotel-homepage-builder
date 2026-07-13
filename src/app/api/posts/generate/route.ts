import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin/auth";
import { getDataSource } from "@/lib/data";
import { addPostToBundle } from "@/lib/data/demo/registry";
import { getServiceClient } from "@/lib/data/supabase/client";
import { writePost } from "@/lib/marketing/writer";
import { tenantDomainFromHost } from "@/lib/tenant/host";

/**
 * POST /api/posts/generate — marketing automation entry point.
 * { topic, kind?, hotelSlug? } → AI-written, localized post.
 *
 * Demo mode publishes into the in-memory tenant immediately; Supabase mode
 * saves a DRAFT (staff publish from the console — automated content never
 * goes live unreviewed on a real site).
 */

const bodySchema = z.object({
  topic: z.string().trim().min(2).max(300),
  kind: z
    .enum(["notice", "promo", "article", "hotel_guide", "local_guide"])
    .default("article"),
  /** 사장님 메모 — 가이드 글의 사실 근거 (AI가 지어내지 않도록) */
  ownerNotes: z.string().trim().max(3000).optional(),
  /** 타깃 검색어 — 이 글이 노출되길 원하는 검색 질의 */
  targetKeyword: z.string().trim().max(100).optional(),
  /** target a specific tenant (e.g. a wizard-generated one); default = host tenant */
  hotelSlug: z.string().trim().max(60).optional(),
});

export async function POST(req: NextRequest) {
  // content creation is a console operation, not a public surface
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
  const hotel = parsed.data.hotelSlug
    ? await data.getHotelBySlug(parsed.data.hotelSlug)
    : await data.getHotelByDomain(tenantDomainFromHost(req.headers.get("host")));
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "hotel_not_found" }, { status: 404 });
  }

  // hotel guides are grounded in the property's actual data
  let facts: string | undefined;
  if (parsed.data.kind === "hotel_guide") {
    const rooms = await data.listRoomTypes(hotel.id);
    facts = [
      `check-in ${hotel.contact.checkIn ?? "-"} / check-out ${hotel.contact.checkOut ?? "-"}`,
      hotel.contact.phone ? `phone ${hotel.contact.phone}` : null,
      ...rooms.map((room) => {
        const name = room.content[hotel.defaultLocale]?.name ?? room.slug;
        return `room "${name}": base ${room.occupancyBase} / max ${room.occupancyMax} guests${
          room.sizeSqm ? `, ${room.sizeSqm}㎡` : ""
        }, amenities: ${room.amenities.join(", ") || "-"}`;
      }),
    ]
      .filter(Boolean)
      .join("\n");
  }

  const { post, mode } = await writePost(hotel, {
    topic: parsed.data.topic,
    kind: parsed.data.kind,
    ownerNotes: parsed.data.ownerNotes,
    targetKeyword: parsed.data.targetKeyword,
    facts,
  });

  // slug uniqueness per tenant (URL is a permanent contract)
  const existing = new Set((await data.listAllPosts(hotel.id)).map((p) => p.slug));
  while (existing.has(post.slug)) {
    post.slug = `${post.slug.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const dataSourceMode =
    process.env.DATA_SOURCE ??
    (process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "demo");

  if (dataSourceMode === "demo") {
    addPostToBundle(hotel.id, post);
  } else {
    const { error } = await getServiceClient().from("posts").insert({
      id: post.id,
      hotel_id: hotel.id,
      slug: post.slug,
      kind: post.kind,
      title: post.title,
      excerpt: post.excerpt,
      cover_image: post.coverImage ?? null,
      body_sections: post.bodySections,
      status: "draft", // staff review before it goes live
      published_at: null,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: "persist_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    mode,
    slug: post.slug,
    status: dataSourceMode === "demo" ? "published" : "draft",
    url: `/${hotel.defaultLocale}/news/${post.slug}`,
  });
}
