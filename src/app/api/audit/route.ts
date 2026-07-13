import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scoreSite } from "@/lib/onboarding/audit";
import { extractSite, normalizeSiteUrl } from "@/lib/onboarding/extract";

/**
 * POST /api/audit — the wizard's first step: 진단.
 * { url } → crawl the old site → quality scorecard.
 *
 * Deliberately generates NOTHING: a site that scores well is told so, and
 * the owner decides whether to proceed. Honest diagnosis is the pitch.
 */

export const maxDuration = 60;

const bodySchema = z.object({ url: z.string().min(4).max(500) });

const BLOCKED =
  /pardon our interruption|access denied|attention required|just a moment|are you a robot|captcha/i;

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

  const target = normalizeSiteUrl(parsed.data.url);
  if (!target) {
    return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
  }

  let extracted;
  try {
    extracted = await extractSite(target);
  } catch (error) {
    console.warn(`[audit] extraction failed for ${target}:`, error);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 422 });
  }
  if (BLOCKED.test(`${extracted.title ?? ""} ${extracted.headings.join(" ")}`)) {
    return NextResponse.json({ ok: false, error: "site_blocked" }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    audit: scoreSite(extracted),
    siteTitle: extracted.siteName ?? extracted.title ?? null,
    imagesFound: extracted.images.length,
  });
}
