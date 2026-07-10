import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registerBundle, isSlugTaken } from "@/lib/data/demo/registry";
import { extractSite, normalizeSiteUrl } from "@/lib/onboarding/extract";
import { generateBundle, slugify } from "@/lib/onboarding/generate";
import { pickLocalized } from "@/lib/i18n/locales";

/**
 * POST /api/onboarding — the wizard's engine.
 * { url } → crawl the old site → regenerate as a tenant → preview URL.
 *
 * Demo mode registers the tenant in memory (Before/After works with zero
 * external services; resets on restart). Supabase persistence is the next
 * step of this pipeline.
 */

const bodySchema = z.object({ url: z.string().min(4).max(500) });

export async function POST(req: NextRequest) {
  const mode =
    process.env.DATA_SOURCE ??
    (process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "demo");
  if (mode !== "demo") {
    return NextResponse.json(
      { ok: false, error: "persistent_onboarding_not_yet_supported" },
      { status: 501 },
    );
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const target = normalizeSiteUrl(parsed.data.url);
  if (!target) {
    return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
  }

  let extracted;
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

  let slug = slugify(
    extracted.siteName ?? extracted.title ?? target.hostname.replace(/^www\./, ""),
  );
  while (isSlugTaken(slug)) {
    slug = `${slug.slice(0, 34)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const bundle = await generateBundle(extracted, slug);
  registerBundle(bundle);

  const hotelName =
    pickLocalized(bundle.hotel.name, "ko", bundle.hotel.defaultLocale) ?? slug;

  return NextResponse.json({
    ok: true,
    slug,
    hotelName,
    mode: bundle.mode,
    imagesFound: extracted.images.length,
    redirectsCreated: bundle.redirects.length,
    previewUrl: `/${bundle.hotel.defaultLocale}?_tenant=${bundle.hotel.primaryDomain}`,
    exitUrl: `/?_tenant=`,
  });
}
