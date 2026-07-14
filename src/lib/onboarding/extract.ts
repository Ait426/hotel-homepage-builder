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

/** Quality signals observed while crawling — the raw material for the
 *  site audit score (좋다/나쁘다의 기준). All page-level flags are ORed
 *  across every page we fetched. */
export interface SiteSignals {
  https: boolean;
  /** responsive meta viewport present */
  viewport: boolean;
  /** hreflang alternates → multilingual */
  hreflang: boolean;
  /** og:title / og:image → link sharing previews */
  ogTags: boolean;
  /** schema.org JSON-LD structured data */
  jsonLd: boolean;
  /** real online-booking pathway (실시간/온라인 예약, booking engines) */
  bookingHint: boolean;
  /** <frameset> shell — 1990s-era markup */
  frameset: boolean;
  /** .swf embeds */
  flash: boolean;
  /** euc-kr era charset declared */
  legacyCharset: boolean;
  /** big HTML but no readable images/text — a JS-only (SPA) site the
   *  crawler cannot honestly assess for photos */
  scriptRendered: boolean;
}

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
  signals: SiteSignals;
}

export function neutralSignals(): SiteSignals {
  return {
    https: true,
    viewport: false,
    hreflang: false,
    ogTags: false,
    jsonLd: false,
    bookingHint: false,
    frameset: false,
    flash: false,
    legacyCharset: false,
    scriptRendered: false,
  };
}

const FETCH_TIMEOUT_MS = 10_000;
/** the entry page gets more patience — legacy hosts stall on first connect */
const FIRST_PAGE_TIMEOUT_MS = 15_000;
const MAX_BYTES = 2_000_000;
/** measurement cap: past this an image is unquestionably photo-sized */
const MAX_IMAGE_MEASURE_BYTES = 8_000_000;
const MAX_REDIRECTS = 5;
const MAX_IMAGES = 20;
const MAX_FRAME_FOLLOWS = 3;
const MAX_SUBPAGE_FOLLOWS = 3;

/** inet_aton-style IPv4 parse: 1–4 dot-separated parts, each decimal,
 *  octal (leading 0) or hex (0x…), the last part filling the remaining
 *  bytes — the spellings (`2130706433`, `0x7f000001`, `0177.0.0.1`,
 *  `127.1`) that a naive `/^127\./` prefix check waves through. Returns
 *  the 32-bit address, or null if the string isn't a valid IPv4 form. */
function parseIPv4(host: string): number | null {
  const parts = host.split(".").map((p) => {
    // "0x" with no digits is valid (= 0) per the WHATWG/inet_aton rules
    if (/^0x[0-9a-f]*$/i.test(p)) return p.length === 2 ? 0 : parseInt(p, 16);
    if (/^0[0-7]*$/.test(p)) return p === "0" ? 0 : parseInt(p, 8);
    if (/^[1-9]\d*$/.test(p)) return parseInt(p, 10);
    return NaN;
  });
  if (parts.length < 1 || parts.length > 4 || parts.some(Number.isNaN)) {
    return null;
  }
  const last = parts.pop()!;
  if (parts.some((n) => n > 255)) return null;
  if (last >= 2 ** (8 * (4 - parts.length))) return null;
  return (
    (parts.reduce((acc, n, i) => acc + n * 2 ** (8 * (3 - i)), 0) + last) >>> 0
  );
}

function isPrivateIPv4(v: number): boolean {
  const a = (v >>> 24) & 0xff;
  const b = (v >>> 16) & 0xff;
  if (a === 0 || a === 10 || a === 127) return true; // "this net", private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0 && ((v >>> 8) & 0xff) === 0) return true; // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** SSRF guard for every outbound crawl request (entry URL, every redirect
 *  hop,
 *  frames, subpages, images). Blocks internal names, private/reserved IPv4
 *  in any inet_aton spelling, and — deliberately — ALL IPv6 literals: no
 *  legacy hotel site is reachable only via a raw IPv6 URL, and correctly
 *  classifying every private/mapped IPv6 spelling is exactly where SSRF
 *  filters go wrong. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    host.endsWith(".onion")
  ) {
    return true;
  }
  if (host.startsWith("[") || host.includes(":")) return true; // IPv6 literal
  // anything shaped like a numeric address must parse as PUBLIC IPv4;
  // numeric-looking-but-malformed is refused rather than sent to DNS
  if (/^(0x[0-9a-f]*|\d+)(\.(0x[0-9a-f]*|\d+)){0,3}$/i.test(host)) {
    const v = parseIPv4(host);
    return v === null || isPrivateIPv4(v);
  }
  // dotless names ("intranet", "router") resolve via search domains — no
  // public hotel site lives on one
  return !host.includes(".");
}

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
  if (isPrivateHost(url.hostname)) return null;
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

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface Page {
  html: string;
  base: URL;
}

/**
 * fetch with redirects followed by hand so EVERY hop re-passes the SSRF
 * guard — `redirect: "follow"` only ever let us vet the first URL, so a
 * public site could 302 the crawler into 169.254.169.254 or the LAN.
 * Returns the terminal response plus the URL it actually came from.
 */
async function fetchGuarded(
  target: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<{ res: Response; finalUrl: URL } | null> {
  let url = target;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      isPrivateHost(url.hostname)
    ) {
      console.warn(`[onboarding] blocked non-public url ${url.hostname}`);
      return null;
    }
    const res = await fetch(url, { signal, redirect: "manual", headers });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      res.body?.cancel().catch(() => {});
      if (!location) return null;
      try {
        url = new URL(location, url);
      } catch {
        return null;
      }
      continue;
    }
    return { res, finalUrl: url };
  }
  return null; // redirect chain too long
}

/** Read at most maxBytes of the body, then cancel the stream — the cap has
 *  to apply while downloading; buffering a 200MB page and slicing after
 *  the fact caps nothing but the parse. */
async function readBodyLimited(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const reader = res.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      chunks.push(value);
    }
  }
  if (received >= maxBytes) await reader.cancel().catch(() => {});
  const total = Math.min(received, maxBytes);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, total - offset);
    out.set(take === chunk.byteLength ? chunk : chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= total) break;
  }
  return out.buffer;
}

async function fetchPage(
  target: URL,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Page | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const fetched = await fetchGuarded(
      target,
      {
        // a real browser UA — legacy sites (and their cheap WAFs) routinely
        // serve bots an empty shell or a block page
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ko,en;q=0.8",
      },
      controller.signal,
    );
    if (!fetched) return null;
    const { res, finalUrl } = fetched;
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    const buffer = await readBodyLimited(res, MAX_BYTES);
    const html = decodeBody(buffer, res.headers.get("content-type"));
    console.log(`[onboarding] fetched ${finalUrl} bytes=${buffer.byteLength}`);
    return { html, base: finalUrl };
  } catch (error) {
    const e = error as Error & { cause?: { code?: string; message?: string } };
    console.warn(
      `[onboarding] fetch failed ${target}: ${e.cause?.code ?? e.cause?.message ?? e.message}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Download one image candidate and measure it. Photos are big; the
 *  buttons, logos and text sprites that litter legacy pages are small —
 *  byte size separates them better than any filename heuristic. */
async function measureImage(
  url: string,
): Promise<{ url: string; bytes: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return null;
    }
    // image URLs come from the crawled site's HTML — as attacker-controlled
    // as any redirect, so they go through the same per-hop SSRF guard
    const fetched = await fetchGuarded(
      target,
      { "User-Agent": BROWSER_UA, Accept: "image/*" },
      controller.signal,
    );
    if (!fetched) return null;
    const { res } = fetched;
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    // we only need the size, never the pixels: trust Content-Length when
    // declared, otherwise count bytes off the stream — capped, and without
    // retaining the data
    const declared = Number(res.headers.get("content-length"));
    if (Number.isInteger(declared) && declared > 0) {
      res.body?.cancel().catch(() => {});
      return { url, bytes: Math.min(declared, MAX_IMAGE_MEASURE_BYTES) };
    }
    const reader = res.body?.getReader();
    if (!reader) return null;
    let bytes = 0;
    while (bytes < MAX_IMAGE_MEASURE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value?.byteLength ?? 0;
    }
    if (bytes >= MAX_IMAGE_MEASURE_BYTES) await reader.cancel().catch(() => {});
    return { url, bytes: Math.min(bytes, MAX_IMAGE_MEASURE_BYTES) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** photo-sized threshold; smaller survivors are used only as a last resort */
const PHOTO_MIN_BYTES = 15_000;
const IMAGE_MIN_BYTES = 3_000;

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
  // JS redirect shells: window.location.href="/lander" (and friends).
  // Only when the page is a tiny shell — big pages mention location.href in
  // ordinary scripts, and following those would wander off the site.
  if (html.length < 4096) {
    add(
      html.match(
        /(?:window\.|document\.|top\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
      )?.[1],
    );
    add(html.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i)?.[1]);
  }
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
  signals: SiteSignals;
  /** total decoded HTML chars across fetched pages — SPA/shell detection */
  htmlChars: number;
}

/** a real booking pathway — not just a phone number on an info page */
const BOOKING_HINT =
  /(예약하기|실시간\s?예약|온라인\s?예약|booking\s?engine|book\s?now|booking\.com|agoda|expedia|yanolja|야놀자|여기어때|goodchoice|naver\.me\/book|booking\.naver)/i;

function harvest(page: Page, acc: Accumulator): void {
  const { html, base } = page;
  acc.htmlChars += html.length;

  // quality signals (ORed across pages)
  const s = acc.signals;
  s.viewport ||= /<meta[^>]+name=["']viewport["']/i.test(html);
  s.hreflang ||= /\bhreflang=/i.test(html);
  s.ogTags ||= /property=["']og:(title|image)["']/i.test(html);
  s.jsonLd ||= /application\/ld\+json/i.test(html);
  s.bookingHint ||= BOOKING_HINT.test(html);
  s.frameset ||= /<frameset[\s>]/i.test(html);
  s.flash ||= /\.swf\b/i.test(html);
  s.legacyCharset ||= /charset=["']?(euc-kr|ks_c_5601|ms949|johab)/i.test(html);

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
  // one retry on the entry page: big/slow legacy sites miss the first
  // window intermittently, and failing the whole wizard on that is unfair
  const first =
    (await fetchPage(target, FIRST_PAGE_TIMEOUT_MS)) ??
    (await fetchPage(target, FIRST_PAGE_TIMEOUT_MS));
  if (!first) throw new Error("fetch_failed");

  const acc: Accumulator = {
    origin: first.base,
    images: [],
    headings: [],
    paragraphs: [],
    internalPaths: [],
    signals: { ...neutralSignals(), https: first.base.protocol === "https:" },
    htmlChars: 0,
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

  // lots of markup but nothing readable → the site paints itself with JS;
  // photo/text judgements from this crawl would be dishonest
  acc.signals.scriptRendered =
    acc.htmlChars > 100_000 && acc.images.length === 0;

  // keep only images that actually load AND are photo-sized — a broken or
  // button-sized "hero" is exactly the downgrade feeling we must not ship
  const measured = (
    await Promise.all(acc.images.slice(0, 14).map((u) => measureImage(u)))
  ).filter((m): m is { url: string; bytes: number } => m !== null);
  const photos = measured.filter((m) => m.bytes >= PHOTO_MIN_BYTES);
  const pool =
    photos.length > 0
      ? photos
      : measured.filter((m) => m.bytes >= IMAGE_MIN_BYTES);
  const images = pool.sort((a, b) => b.bytes - a.bytes).map((m) => m.url);

  console.log(
    `[onboarding] extracted ${acc.origin.hostname}: images=${images.length}/${acc.images.length} headings=${acc.headings.length} paths=${acc.internalPaths.length}`,
  );

  return {
    url: first.base.toString(),
    title: acc.title,
    siteName: acc.siteName,
    description: acc.description,
    images,
    headings: acc.headings,
    paragraphs: acc.paragraphs,
    phone: acc.phone,
    email: acc.email,
    address: acc.address,
    internalPaths: acc.internalPaths,
    signals: acc.signals,
  };
}

/** Nothing usable came back — a bot wall or an empty shell. Scoring (or
 *  regenerating from) this would be judging a page the guests never see. */
export function looksUnreadable(site: ExtractedSite): boolean {
  return !site.title && site.images.length === 0 && site.paragraphs.length === 0;
}
