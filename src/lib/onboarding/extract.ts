/**
 * Old-site extraction: fetch the hotel's existing homepage and pull out the
 * raw material for regeneration — name, copy, photos, contact.
 *
 * Dependency-free by design (regex over HTML is fine here: we want signals,
 * not a DOM). Handles the legacy reality of 구닥다리 sites: EUC-KR charsets,
 * relative image URLs, phone numbers in plain text.
 */

import "server-only";

export interface ExtractedSite {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  images: string[];
  headings: string[];
  paragraphs: string[];
  phone?: string;
  email?: string;
  address?: string;
  /** same-origin page paths found on the old site — 301'd to the new site
   *  so accumulated search ranking moves over with the domain */
  internalPaths: string[];
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;

/** normalize + guard: https/http only, no private/internal hosts (SSRF). */
export function normalizeSiteUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "0.0.0.0" ||
    host === "[::1]";
  if (isPrivate) return null;
  return url;
}

function decodeBody(buffer: ArrayBuffer, contentType: string | null): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const declared =
    contentType?.match(/charset=([\w-]+)/i)?.[1] ??
    utf8.slice(0, 2048).match(/charset=["']?([\w-]+)/i)?.[1];
  const charset = declared?.toLowerCase();
  if (charset && charset !== "utf-8" && charset !== "utf8") {
    try {
      const alt = new TextDecoder(charset, { fatal: false }).decode(buffer);
      // Legacy pages lie about their charset (e.g. charset=unicode — a
      // UTF-16 alias — on plain ASCII pages). Trust whichever decoding
      // actually looks like markup.
      const markupScore = (s: string) =>
        (s.slice(0, 4000).match(/<[a-z!/]/gi) ?? []).length;
      return markupScore(alt) >= markupScore(utf8) ? alt : utf8;
    } catch {
      // unknown label → keep utf-8 attempt
    }
  }
  return utf8;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absolutize(src: string, base: URL): string | null {
  try {
    const url = new URL(src, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const IMAGE_SKIP = /(logo|icon|btn|button|banner_?top|sprite|blank|pixel|arrow|bullet|spacer|favicon|\.svg|\.gif)/i;

export async function extractSite(target: URL): Promise<ExtractedSite> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; StayBookBot/1.0; +https://staybook.example)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`fetch_failed_${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const html = decodeBody(buffer.slice(0, MAX_BYTES), response.headers.get("content-type"));
  const base = new URL(response.url || target.toString());
  console.log(
    `[onboarding] fetched ${base} status=${response.status} bytes=${buffer.byteLength} ct=${response.headers.get("content-type")}`,
  );

  const pick = (re: RegExp): string | undefined => {
    const m = html.match(re);
    return m?.[1] ? stripTags(m[1]).slice(0, 300) || undefined : undefined;
  };

  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const siteName =
    pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ??
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

  // images: og:image first, then <img src>, filtered and deduped
  const images: string[] = [];
  const push = (src: string | undefined | null) => {
    if (!src) return;
    const abs = absolutize(src.trim(), base);
    if (abs && !IMAGE_SKIP.test(abs) && !images.includes(abs) && images.length < 16) {
      images.push(abs);
    }
  };
  for (const m of html.matchAll(
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
  )) {
    push(m[1]);
  }
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    push(m[1]);
  }

  const headings: string[] = [];
  for (const m of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = stripTags(m[1]);
    if (text && text.length >= 2 && text.length <= 120 && !headings.includes(text)) {
      headings.push(text);
      if (headings.length >= 12) break;
    }
  }

  // body text: strip scripts/styles, then keep substantial sentences
  const bodyText = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " "),
  );
  const paragraphs = bodyText
    .split(/(?<=[.!?다요됨niju])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 400)
    .slice(0, 10);

  const phone =
    html.match(/href=["']tel:([\d+\-. ()]{7,20})["']/i)?.[1]?.trim() ??
    bodyText.match(/(0\d{1,2}[-. )]?\d{3,4}[-. ]?\d{4})/)?.[1];
  const email =
    html.match(/href=["']mailto:([^"'?]+)["']/i)?.[1] ??
    bodyText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  // Korean address heuristic: 시/도 + ... + 로/길 + number
  const address = bodyText.match(
    /((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^.|<]{5,60}?(?:로|길|대로)\s?\d+[-\d]*(?:[^.|<]{0,20}?(?:층|호))?)/,
  )?.[1];

  // internal links → old URL inventory for the 301 migration
  const ASSET_LINK = /\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|css|js|xml|txt|hwp|docx?)$/i;
  const internalPaths: string[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const link = new URL(m[1].trim(), base);
      if (link.hostname !== base.hostname) continue;
      const path = link.pathname.replace(/\/+$/, "") || "/";
      if (path === "/" || ASSET_LINK.test(path) || path.length > 120) continue;
      if (!internalPaths.includes(path)) {
        internalPaths.push(path);
        if (internalPaths.length >= 60) break;
      }
    } catch {
      // unparsable href — skip
    }
  }

  return {
    url: base.toString(),
    title,
    siteName,
    description,
    images,
    headings,
    paragraphs,
    phone,
    email,
    address,
    internalPaths,
  };
}
