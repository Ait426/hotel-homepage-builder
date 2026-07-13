import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
  kind: z.enum(["notice", "promo", "article"]).default("article"),
  /** target a specific tenant (e.g. a wizard-generated one); default = host tenant */
  hotelSlug: z.string().trim().max(60).optional(),
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

  const data = getDataSource();
  const hotel = parsed.data.hotelSlug
    ? await data.getHotelBySlug(parsed.data.hotelSlug)
    : await data.getHotelByDomain(tenantDomainFromHost(req.headers.get("host")));
  if (!hotel) {
    return NextResponse.json({ ok: false, error: "hotel_not_found" }, { status: 404 });
  }

  const { post, mode } = await writePost(hotel, parsed.data.topic, parsed.data.kind);

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
