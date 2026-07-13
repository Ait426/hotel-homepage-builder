/**
 * Old-site extraction: fetch the hotel's existing homepage and pull out the
 * raw material for regeneration — name, copy, photos, contact.
 *
 * Dependency-free by design (regex over HTML is fine here: we want signals,
 * not a DOM). Handles the legacy reality of 구닥다리 sites:
 *  - EUC-KR / lying charsets, relative image URLs, phone numbers in text
 *  - frameset/iframe shells whose real content is one hop away
 *  - lazy-loaded galleries (data-src / data-original) where <img src> is a
 *    blank placeholder
 *  - hero photos in CSS background-image, not <img> at all
 *  - photos living on subpages (객실/갤러리/시설), not the homepage
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

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_IMAGES = 20;
const MAX_FRAME_FOLLOWS = 3;
const MAX_SUBPAGE_FOLLOWS = 3;

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
/** riskier sources (lazy attrs, CSS urls) must at least look like a photo */
const IMAGE_EXT = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;

interface Page {
  html: string;
  base: URL;
}

async function fetchPage(target: URL): Promise<Page | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // a real browser UA — legacy sites (and their cheap WAFs) routinely
        // serve bots an empty shell or a block page
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko,en;q=0.8",
      },
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const html = decodeBody(
      buffer.slice(0, MAX_BYTES),
      response.headers.get("content-type"),
    );
    const base = new URL(response.url || target.toString());
    console.log(`[onboarding] fetched ${base} bytes=${buffer.byteLength}`);
    return { html, base };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** frameset/iframe/meta-refresh targets — the shell page's real content. */
function frameTargets(html: string, base: URL): URL[] {
  const targets: URL[] = [];
  const add = (src: string | undefined) => {
    if (!src) return;
    try {
      const url = new URL(src.trim(), base);
      if (url.hostname !== base.hostname) return; // same-origin only
      if (targets.some((t) => t.toString() === url.toString())) return;
      targets.push(url);
    } catch {
      // unparsable — skip
    }
  };
  for (const m of html.matchAll(/<i?frame[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  add(
    html.match(
      /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url\s*=\s*([^"'>\s]+)/i,
    )?.[1],
  );
  return targets.slice(0, MAX_FRAME_FOLLOWS);
}

/** subpages most likely to hold the property's real photos */
const PHOTO_PATH = /(room|guest|suite|gallery|photo|facil|spa|pool|view|about|intro|tour|객실|갤러리|시설|소개)/i;

interface Accumulator {
  origin: URL;
  title?: string;
  siteName?: string;
  description?: string;
  images: string[];
  headings: string[];
  paragraphs: string[];
  phone?: string;
  email?: string;
  address?: string;
  internalPaths: string[];
}

function harvest(page: Page, acc: Accumulator): void {
  const { html, base } = page;

  const pick = (re: RegExp): string | undefined => {
    const m = html.match(re);
    return m?.[1] ? stripTags(m[1]).slice(0, 300) || undefined : undefined;
  };

  acc.title ??= pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  acc.siteName ??=
    pick(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  acc.description ??=
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ??
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

  // --- images: og:image → <img src> → lazy attrs → srcset → CSS url() -----
  const push = (src: string | undefined | null, requireExt = false) => {
    if (!src) return;
    const abs = absolutize(src.trim(), base);
    if (!abs || IMAGE_SKIP.test(abs)) return;
    if (requireExt && !IMAGE_EXT.test(abs)) return;
    if (!acc.images.includes(abs) && acc.images.length < MAX_IMAGES) {
      acc.images.push(abs);
    }
  };
  for (const m of html.matchAll(
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
  )) {
    push(m[1]);
  }
  for (const m of html.matchAll(/<img[^>]+?\bsrc=["']([^"']+)["']/gi)) {
    push(m[1]);
  }
  // lazy-loading attributes — on legacy galleries the real photo lives here
  for (const m of html.matchAll(
    /\bdata-(?:src|original|lazy|lazy-src|bg|image|echo)=["']([^"']+)["']/gi,
  )) {
    push(m[1], true);
  }
  // srcset: take the last (largest) candidate
  for (const m of html.matchAll(/\bsrcset=["']([^"']+)["']/gi)) {
    push(m[1].split(",").pop()?.trim().split(/\s+/)[0], true);
  }
  // CSS background images (inline styles and <style> blocks)
  for (const m of html.matchAll(
    /background(?:-image)?\s*:\s*[^;"'{}]*url\(\s*["']?([^"')]+?)["']?\s*\)/gi,
  )) {
    push(m[1], true);
  }

  for (const m of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = stripTags(m[1]);
    if (
      text &&
      text.length >= 2 &&
      text.length <= 120 &&
      !acc.headings.includes(text) &&
      acc.headings.length < 12
    ) {
      acc.headings.push(text);
    }
  }

  // body text: strip scripts/styles, then keep substantial sentences
  const bodyText = stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " "),
  );
  for (const s of bodyText.split(/(?<=[.!?다요됨niju])\s+/)) {
    const text = s.trim();
    if (
      text.length >= 30 &&
      text.length <= 400 &&
      !acc.paragraphs.includes(text) &&
      acc.paragraphs.length < 10
    ) {
      acc.paragraphs.push(text);
    }
  }

  acc.phone ??=
    html.match(/href=["']tel:([\d+\-. ()]{7,20})["']/i)?.[1]?.trim() ??
    bodyText.match(/(0\d{1,2}[-. )]?\d{3,4}[-. ]?\d{4})/)?.[1];
  acc.email ??=
    html.match(/href=["']mailto:([^"'?]+)["']/i)?.[1] ??
    bodyText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  // Korean address heuristic: 시/도 + ... + 로/길 + number
  acc.address ??= bodyText.match(
    /((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^.|<]{5,60}?(?:로|길|대로)\s?\d+[-\d]*(?:[^.|<]{0,20}?(?:층|호))?)/,
  )?.[1];

  // internal links → old URL inventory for the 301 migration
  const ASSET_LINK = /\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|css|js|xml|txt|hwp|docx?)$/i;
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const link = new URL(m[1].trim(), base);
      if (link.hostname !== acc.origin.hostname) continue;
      const path = link.pathname.replace(/\/+$/, "") || "/";
      if (path === "/" || ASSET_LINK.test(path) || path.length > 120) continue;
      if (!acc.internalPaths.includes(path) && acc.internalPaths.length < 60) {
        acc.internalPaths.push(path);
      }
    } catch {
      // unparsable href — skip
    }
  }
}

export async function extractSite(target: URL): Promise<ExtractedSite> {
  const first = await fetchPage(target);
  if (!first) throw new Error("fetch_failed");

  const acc: Accumulator = {
    origin: first.base,
    images: [],
    headings: [],
    paragraphs: [],
    internalPaths: [],
  };
  harvest(first, acc);

  // frameset/iframe shells: the homepage is empty chrome — follow one hop
  const frames = frameTargets(first.html, first.base);
  if (frames.length > 0) {
    const pages = await Promise.all(frames.map((u) => fetchPage(u)));
    for (const page of pages) if (page) harvest(page, acc);
  }

  // thin photo harvest → crawl the subpages where legacy sites keep them
  if (acc.images.length < 6 && acc.internalPaths.length > 0) {
    const keyworded = acc.internalPaths.filter((p) => PHOTO_PATH.test(p));
    const candidates = (keyworded.length > 0 ? keyworded : acc.internalPaths).slice(
      0,
      MAX_SUBPAGE_FOLLOWS,
    );
    const pages = await Promise.all(
      candidates.map((p) => {
        const url = absolutize(p, acc.origin);
        return url ? fetchPage(new URL(url)) : Promise.resolve(null);
      }),
    );
    for (const page of pages) if (page) harvest(page, acc);
  }

  console.log(
    `[onboarding] extracted ${acc.origin.hostname}: images=${acc.images.length} headings=${acc.headings.length} paths=${acc.internalPaths.length}`,
  );

  return {
    url: first.base.toString(),
    title: acc.title,
    siteName: acc.siteName,
    description: acc.description,
    images: acc.images,
    headings: acc.headings,
    paragraphs: acc.paragraphs,
    phone: acc.phone,
    email: acc.email,
    address: acc.address,
    internalPaths: acc.internalPaths,
  };
}
