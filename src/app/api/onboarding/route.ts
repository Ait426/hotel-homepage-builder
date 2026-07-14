import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDataSource } from "@/lib/data";
import { registerBundle, isSlugTaken } from "@/lib/data/demo/registry";
import { scoreSite } from "@/lib/onboarding/audit";
import { extractSite, looksUnreadable, normalizeSiteUrl } from "@/lib/onboarding/extract";
import {
  cleanName,
  generateBundle,
  manualToExtracted,
  slugify,
} from "@/lib/onboarding/generate";
import { persistBundle } from "@/lib/onboarding/persist";
import { pickLocalized } from "@/lib/i18n/locales";

/**
 * POST /api/onboarding — the wizard's engine.
 * { url } → crawl the old site → regenerate as a tenant → preview URL.
 *
 * Demo mode registers the tenant in memory (Before/After with zero external
 * services; resets on restart). Supabase mode persists real tenant rows —
 * the "도메인만 있으면 몇 시간 안에 완성" production path.
 */

// multi-page crawl + AI generation exceed the default function timeout
export const maxDuration = 60;

// two onboarding paths: existing-site URL, or from-scratch manual input
const bodySchema = z
  .object({
    url: z.string().min(4).max(500).optional(),
    manual: z
      .object({
        name: z.string().trim().min(2).max(60),
        propertyType: z.enum(["hotel", "motel", "resort", "pension", "guesthouse"]),
        intro: z.string().trim().max(500).optional(),
        phone: z.string().trim().max(30).optional(),
        address: z.string().trim().max(120).optional(),
      })
      .optional(),
  })
  .refine((d) => (d.url ? !d.manual : !!d.manual), {
    message: "provide exactly one of url / manual",
  });

export async function POST(req: NextRequest) {
  const mode =
    process.env.DATA_SOURCE ??
    (process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "demo");

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  let extracted;
  let propertyTypeOverride;

  if (parsed.data.url) {
    const target = normalizeSiteUrl(parsed.data.url);
    if (!target) {
      return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
    }

    try {
      extracted = await extractSite(target);
    } catch (error) {
      console.warn(`[onboarding] extraction failed for ${target}:`, error);
      return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 422 });
    }

    // bot-protection pages (Imperva/Cloudflare 등) — 정직하게 실패 처리
    const BLOCKED =
      /pardon our interruption|access denied|attention required|just a moment|are you a robot|captcha/i;
    if (BLOCKED.test(`${extracted.title ?? ""} ${extracted.headings.join(" ")}`)) {
      return NextResponse.json({ ok: false, error: "site_blocked" }, { status: 422 });
    }
    if (looksUnreadable(extracted)) {
      return NextResponse.json({ ok: false, error: "unreadable" }, { status: 422 });
    }
  } else {
    // from-scratch path: no old site to crawl
    extracted = manualToExtracted(parsed.data.manual!);
    propertyTypeOverride = parsed.data.manual!.propertyType;
  }

  let slug = slugify(cleanName(extracted) || "my-stay");
  const slugTaken =
    mode === "demo"
      ? async (s: string) => isSlugTaken(s)
      : async (s: string) => (await getDataSource().getHotelBySlug(s)) !== null;
  while (await slugTaken(slug)) {
    slug = `${slug.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const bundle = await generateBundle(extracted, slug, {
    propertyType: propertyTypeOverride,
  });

  let domain = bundle.hotel.primaryDomain;
  if (mode === "demo") {
    registerBundle(bundle);
  } else {
    const persisted = await persistBundle(bundle);
    if (!persisted.ok) {
      return NextResponse.json(
        { ok: false, error: "persist_failed" },
        { status: 500 },
      );
    }
    domain = persisted.domain;
  }

  const hotelName =
    pickLocalized(bundle.hotel.name, "ko", bundle.hotel.defaultLocale) ?? slug;

  return NextResponse.json({
    ok: true,
    slug,
    hotelName,
    mode: bundle.mode,
    // Before-점수 — the result screen shows what the upgrade started from
    audit: parsed.data.url ? scoreSite(extracted) : null,
    imagesFound: extracted.images.length,
    usedStockImages: bundle.usedStockImages,
    redirectsCreated: bundle.redirects.length,
    previewUrl: `/${bundle.hotel.defaultLocale}?_tenant=${domain}`,
    exitUrl: `/?_tenant=`,
  });
}
