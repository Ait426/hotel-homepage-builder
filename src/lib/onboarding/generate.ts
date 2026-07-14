/**
 * Site generation: extracted old-site material → a full tenant bundle
 * (hotel + rooms + rate plans + sectioned pages).
 *
 * Two paths:
 *  - LLM key set (ANTHROPIC_API_KEY or OPENAI_API_KEY) → the model generates
 *    localized copy + structure (forced tool-use so output is schema-shaped;
 *    we still validate every section against the zod registry — the schema
 *    is the quality floor).
 *  - no key / API failure → heuristic composer builds the site from the
 *    extracted material with the default preset. The flow never breaks.
 */

import "server-only";

import { randomUUID } from "crypto";
import type {
  Hotel,
  PageDef,
  PostDef,
  PropertyType,
  RatePlan,
  RedirectRule,
  RoomType,
  SectionInstance,
} from "@/lib/data/types";
import { generateWithTool } from "@/lib/ai/llm";
import type { Localized } from "@/lib/i18n/locales";
import { SECTION_REGISTRY } from "@/sections/registry";
import { neutralSignals, type ExtractedSite } from "./extract";

export interface GeneratedBundle {
  hotel: Hotel;
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  pages: PageDef[];
  posts: PostDef[];
  /** old-site URLs mapped onto the new structure — SEO moves with the domain */
  redirects: RedirectRule[];
  /** 'ai' when an LLM produced the copy, 'heuristic' for the fallback */
  mode: "ai" | "heuristic";
  /** true when no photos were available and per-type stock placeholders were used */
  usedStockImages: boolean;
}

/** The from-scratch path: a brand-new property with no existing site. */
export interface ManualInput {
  name: string;
  propertyType: PropertyType;
  intro?: string;
  phone?: string;
  address?: string;
}

/** Synthesize the extraction shape from manual input so both onboarding
 *  paths share one generation pipeline. */
export function manualToExtracted(input: ManualInput): ExtractedSite {
  return {
    url: "",
    title: input.name,
    siteName: input.name,
    description: input.intro,
    images: [],
    headings: [],
    paragraphs: input.intro ? [input.intro] : [],
    phone: input.phone,
    address: input.address,
    internalPaths: [],
    signals: neutralSignals(),
  };
}

/** Quality placeholders per property type — swapped for real photos at
 *  review time. A new site must never launch looking empty. */
const STOCK_IMAGES: Record<PropertyType, string[]> = {
  hotel: [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1611892440504-42a792e24d32?q=80&w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1590490360182-c33d57733427?q=80&w=1600&auto=format&fit=crop",
  ],
  motel: [
    "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?q=80&w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?q=80&w=1600&auto=format&fit=crop",
  ],
  resort: [
    "https://images.unsplash.com/photo-1571896349842-33c89424de2d?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?q=80&w=1600&auto=format&fit=crop",
  ],
  pension: [
    "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1587061949409-02df41d5e562?q=80&w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?q=80&w=1600&auto=format&fit=crop",
  ],
  guesthouse: [
    "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?q=80&w=1600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1520277739336-7bf67edfa768?q=80&w=1600&auto=format&fit=crop",
  ],
};

// ---------------------------------------------------------------------------
// property-type awareness — the platform serves all lodging, not just hotels
// ---------------------------------------------------------------------------

export function detectPropertyType(extracted: ExtractedSite): PropertyType {
  const haystack = [
    extracted.title,
    extracted.siteName,
    extracted.description,
    ...extracted.headings,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/리조트|resort/.test(haystack)) return "resort";
  if (/펜션|풀빌라|pool ?villa|pension/.test(haystack)) return "pension";
  if (/게스트하우스|guesthouse|hostel|민박/.test(haystack)) return "guesthouse";
  if (/모텔|motel|무인텔/.test(haystack)) return "motel";
  return "hotel";
}

interface PropertyProfile {
  /** tone instruction injected into the LLM prompt */
  tone: string;
  /** heuristic fallback room types (name ko, base/max, price KRW) */
  rooms: Array<{ ko: string; base: number; max: number; price: number; single?: boolean }>;
}

const PROPERTY_PROFILES: Record<PropertyType, PropertyProfile> = {
  hotel: {
    tone: "Quiet luxury-hotel tone: restrained, confident, editorial.",
    rooms: [
      { ko: "스탠다드", base: 2, max: 2, price: 90_000 },
      { ko: "디럭스", base: 2, max: 3, price: 130_000 },
    ],
  },
  motel: {
    tone: "Clean, modern, value-forward tone for a boutique motel: emphasize privacy, cleanliness, smart amenities, easy parking. Never sleazy, never apologetic.",
    rooms: [
      { ko: "스탠다드", base: 2, max: 2, price: 60_000 },
      { ko: "프리미엄", base: 2, max: 2, price: 80_000 },
    ],
  },
  resort: {
    tone: "Family-resort tone: activities, pools, seasons, togetherness — spacious and bright.",
    rooms: [
      { ko: "디럭스", base: 2, max: 3, price: 180_000 },
      { ko: "패밀리 스위트", base: 4, max: 5, price: 280_000 },
    ],
  },
  pension: {
    tone: "Pension/pool-villa tone: private whole-unit stays, BBQ evenings, nature, couples and small groups.",
    rooms: [
      { ko: "독채 A동", base: 2, max: 4, price: 150_000, single: true },
      { ko: "독채 B동", base: 4, max: 6, price: 220_000, single: true },
    ],
  },
  guesthouse: {
    tone: "Warm guesthouse tone: hosts, community, local tips, honest prices.",
    rooms: [
      { ko: "트윈룸", base: 2, max: 2, price: 55_000 },
      { ko: "패밀리룸", base: 3, max: 4, price: 85_000 },
    ],
  },
};

/**
 * Map an old site's URL inventory onto the new structure. Keyword-classified;
 * anything unrecognized lands on the home page — a 301 to home still carries
 * the link equity that a 404 would burn.
 */
export function mapOldPaths(internalPaths: string[]): RedirectRule[] {
  const classify = (path: string): string => {
    const p = path.toLowerCase();
    if (/room|guest|suite|stay|숙박|객실|스위트/.test(p)) return "/rooms";
    if (/book|reserv|예약/.test(p)) return "/booking";
    if (/contact|inquiry|문의|location|direction|way|map|오시는길/.test(p)) return "/contact";
    return "/";
  };
  return internalPaths.map((fromPath) => ({
    fromPath,
    toPath: classify(fromPath),
    statusCode: 301 as const,
  }));
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii.length >= 3 ? ascii.slice(0, 40) : `stay-${randomUUID().slice(0, 8)}`;
}

function validateSections(sections: SectionInstance[]): SectionInstance[] {
  return sections.filter((section) => {
    const entry = SECTION_REGISTRY[section.type]?.[section.version];
    if (!entry) return false;
    const parsed = entry.schema.safeParse(section.props);
    if (!parsed.success) {
      console.warn(
        `[onboarding] generated section "${section.type}" failed schema — dropped:`,
        parsed.error.issues[0]?.message,
      );
      return false;
    }
    section.props = parsed.data as Record<string, unknown>;
    return true;
  });
}

const NAME_JUNK_TAIL =
  /\s*(?:intro|index|main|home|homepage|welcome|메인|홈페이지|공식\s*홈페이지|환영합니다)\s*$/i;

export function cleanName(extracted: ExtractedSite): string {
  const raw = extracted.siteName ?? extracted.title ?? "";
  // titles are often "호텔이름 | 슬로건" or "호텔이름 - 공식홈페이지"
  let first = raw.split(/[|\-–—:·]/)[0]?.trim() ?? "";
  // ...and legacy shells append page words: "Commodore Hotel intro"
  while (first && NAME_JUNK_TAIL.test(first)) {
    first = first.replace(NAME_JUNK_TAIL, "").trim();
  }
  return (first || raw || "My Hotel").slice(0, 60);
}

// ---------------------------------------------------------------------------
// heuristic composer (fallback path — must always succeed)
// ---------------------------------------------------------------------------

interface CopyBundle {
  name: Localized<string>;
  tagline: Localized<string>;
  about: Localized<string>;
  heroHeadline: Localized<string>;
  seoDescription: Localized<string>;
  locales: string[];
  rooms: Array<{
    name: Localized<string>;
    tagline?: Localized<string>;
    description?: Localized<string>;
    occupancyBase: number;
    occupancyMax: number;
    basePrice: number;
    totalRooms?: number;
  }>;
}

function heuristicCopy(
  extracted: ExtractedSite,
  propertyType: PropertyType,
): CopyBundle {
  const name = cleanName(extracted);
  const tagline =
    extracted.description?.slice(0, 80) ??
    extracted.headings.find((h) => h !== name && h.length <= 60) ??
    "다시 태어난 우리 숙소";
  const about =
    extracted.paragraphs.slice(0, 3).join("\n\n") ||
    `${name}에 오신 것을 환영합니다.`;

  return {
    name: { ko: name },
    tagline: { ko: tagline },
    about: { ko: about },
    heroHeadline: { ko: name },
    seoDescription: { ko: extracted.description ?? tagline },
    locales: ["ko"],
    rooms: PROPERTY_PROFILES[propertyType].rooms.map((room) => ({
      name: { ko: room.ko },
      occupancyBase: room.base,
      occupancyMax: room.max,
      basePrice: room.price,
      totalRooms: room.single ? 1 : 5,
    })),
  };
}

// ---------------------------------------------------------------------------
// AI path (Anthropic or OpenAI via the shared LLM helper)
// ---------------------------------------------------------------------------

const SITE_TOOL_SCHEMA = {
  name: "emit_site",
  description: "Emit the regenerated hotel site content.",
  input_schema: {
    type: "object",
    required: ["name", "tagline", "about", "heroHeadline", "seoDescription", "rooms"],
    properties: {
      name: { type: "object", description: "hotel name per locale, keys ko/en/ja" },
      tagline: { type: "object", description: "one-line tagline per locale" },
      about: {
        type: "object",
        description: "2-3 paragraph introduction per locale, paragraphs separated by blank lines",
      },
      heroHeadline: {
        type: "object",
        description: "short poetic hero headline per locale, may contain one \\n line break",
      },
      seoDescription: { type: "object", description: "meta description per locale" },
      rooms: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          required: ["name", "occupancyBase", "occupancyMax", "basePrice"],
          properties: {
            name: { type: "object" },
            tagline: { type: "object" },
            description: { type: "object", description: "1-2 paragraphs per locale" },
            occupancyBase: { type: "integer" },
            occupancyMax: { type: "integer" },
            basePrice: { type: "number", description: "KRW per night, realistic for this hotel" },
          },
        },
      },
    },
  },
} as const;

async function aiCopy(
  extracted: ExtractedSite,
  propertyType: PropertyType,
): Promise<CopyBundle | null> {
  const prompt = `You are regenerating a lodging property's outdated website into a premium one.
Property type: ${propertyType}. ${PROPERTY_PROFILES[propertyType].tone}
Below is the raw material extracted from the old site. Write polished, honest copy in Korean (ko), English (en) and Japanese (ja). Never invent facilities or claims not supported by the material — elevate the tone, not the facts. If room information is missing, propose 2 modest generic room types with realistic KRW prices for this kind of property.

OLD SITE MATERIAL
url: ${extracted.url}
title: ${extracted.title ?? "-"}
description: ${extracted.description ?? "-"}
headings: ${extracted.headings.join(" / ") || "-"}
text: ${extracted.paragraphs.join("\n").slice(0, 3000) || "-"}
phone: ${extracted.phone ?? "-"} / address: ${extracted.address ?? "-"}

Call emit_site exactly once with all locales filled.`;

  const input = (await generateWithTool({
    prompt,
    tool: SITE_TOOL_SCHEMA,
    maxTokens: 4000,
  })) as Partial<CopyBundle> | null;
  if (!input?.name || !input.rooms?.length) return null;
  return {
    name: input.name,
    tagline: input.tagline ?? {},
    about: input.about ?? {},
    heroHeadline: input.heroHeadline ?? input.name,
    seoDescription: input.seoDescription ?? input.tagline ?? {},
    locales: ["ko", "en", "ja"],
    rooms: input.rooms.map((room) => ({
      name: room.name ?? {},
      tagline: room.tagline,
      description: room.description,
      occupancyBase: Math.max(1, Math.trunc(room.occupancyBase ?? 2)),
      occupancyMax: Math.max(
        Math.max(1, Math.trunc(room.occupancyBase ?? 2)),
        Math.trunc(room.occupancyMax ?? 2),
      ),
      basePrice: Math.max(10_000, Math.round(room.basePrice ?? 100_000)),
    })),
  };
}

// ---------------------------------------------------------------------------
// bundle assembly (shared by both paths)
// ---------------------------------------------------------------------------

export async function generateBundle(
  extracted: ExtractedSite,
  slug: string,
  options?: { propertyType?: PropertyType },
): Promise<GeneratedBundle> {
  const propertyType = options?.propertyType ?? detectPropertyType(extracted);
  const ai = await aiCopy(extracted, propertyType);
  const copy = ai ?? heuristicCopy(extracted, propertyType);
  const mode: GeneratedBundle["mode"] = ai ? "ai" : "heuristic";

  const hotelId = randomUUID();
  const usedStockImages = extracted.images.length === 0;
  const images = usedStockImages ? STOCK_IMAGES[propertyType] : extracted.images;
  const heroImage = images[0];
  const galleryImages = images.slice(1, 7);

  const hotel: Hotel = {
    id: hotelId,
    slug,
    name: copy.name,
    propertyType,
    defaultLocale: "ko",
    locales: copy.locales,
    currency: "KRW",
    timezone: "Asia/Seoul",
    theme: {}, // default preset tokens
    contact: {
      phone: extracted.phone,
      email: extracted.email,
      ...(extracted.address ? { address: { ko: extracted.address } } : {}),
      checkIn: "15:00",
      checkOut: "11:00",
    },
    seo: {
      title: copy.name,
      description: copy.seoDescription,
      ...(heroImage ? { ogImage: heroImage } : {}),
    },
    status: "live",
    primaryDomain: `${slug}.preview`,
  };

  const roomTypes: RoomType[] = copy.rooms.map((room, i) => ({
    id: randomUUID(),
    hotelId,
    slug: `room-${i + 1}`,
    code: `RM-${i + 1}`,
    sort: (i + 1) * 10,
    content: Object.fromEntries(
      Object.keys(room.name).map((locale) => [
        locale,
        {
          name: room.name[locale],
          tagline: room.tagline?.[locale],
          description: room.description?.[locale],
        },
      ]),
    ),
    images: images[i + 1] ? [{ url: images[i + 1] }] : heroImage ? [{ url: heroImage }] : [],
    amenities: ["wifi"],
    occupancyBase: room.occupancyBase,
    occupancyMax: room.occupancyMax,
    // the wizard doesn't infer surcharges from a legacy site; owner sets it later
    extraGuestFee: 0,
    totalRooms: room.totalRooms ?? 5,
    status: "active",
  }));

  const ratePlans: RatePlan[] = roomTypes.map((room, i) => ({
    id: randomUUID(),
    hotelId,
    roomTypeId: room.id,
    code: `${room.code}-BAR`,
    name: { ko: "기본 요금", en: "Standard Rate", ja: "スタンダードレート" },
    mealPlan: "room_only",
    cancellationPolicy: {
      freeUntilDaysBefore: 3,
      text: { ko: "체크인 3일 전까지 무료 취소" },
    },
    basePrice: copy.rooms[i].basePrice,
    status: "active",
  }));

  const sections: SectionInstance[] = [];
  if (heroImage) {
    sections.push({
      id: "gen-hero",
      type: "hero",
      version: 1,
      props: {
        image: heroImage,
        heading: copy.heroHeadline,
        subheading: copy.tagline,
        cta: { label: { ko: "객실 보기", en: "Rooms", ja: "客室" }, href: "/rooms" },
        showBookingBar: true,
      },
    });
  }
  sections.push(
    {
      id: "gen-quote",
      type: "quote-banner",
      version: 1,
      props: { quote: copy.tagline },
    },
    {
      id: "gen-rooms",
      type: "rooms-showcase",
      version: 1,
      props: {
        heading: { ko: "객실", en: "Rooms", ja: "客室" },
        limit: 4,
      },
    },
  );
  if (galleryImages.length >= 2) {
    sections.push({
      id: "gen-gallery",
      type: "gallery",
      version: 1,
      props: {
        heading: { ko: "갤러리", en: "Gallery", ja: "ギャラリー" },
        images: galleryImages.map((url) => ({ url })),
      },
    });
  }
  sections.push(
    {
      id: "gen-about",
      type: "rich-text",
      version: 1,
      props: {
        heading: { ko: "소개", en: "About", ja: "ご案内" },
        body: copy.about,
      },
    },
    {
      id: "gen-location",
      type: "location",
      version: 1,
      props: {
        heading: { ko: "오시는 길", en: "Getting Here", ja: "アクセス" },
        showContact: true,
      },
    },
    {
      id: "gen-cta",
      type: "cta-banner",
      version: 1,
      props: {
        heading: {
          ko: "직접 예약하고 최저가로 머무세요",
          en: "Book direct for the best rate",
          ja: "直接予約でベストレート",
        },
        cta: {
          label: { ko: "지금 예약", en: "Book Now", ja: "今すぐ予約" },
          href: "/booking",
        },
      },
    },
  );

  const pages: PageDef[] = [
    {
      id: randomUUID(),
      hotelId,
      path: "/",
      kind: "home",
      sections: validateSections(sections),
      seo: Object.fromEntries(
        Object.keys(copy.name).map((locale) => [
          locale,
          { title: copy.name[locale], description: copy.seoDescription[locale] },
        ]),
      ),
      status: "published",
    },
  ];

  // marketing automation, post #1: the reopening announcement writes itself
  const welcomePost: PostDef = {
    id: randomUUID(),
    hotelId,
    slug: "grand-renewal",
    kind: "notice",
    title: Object.fromEntries(
      Object.keys(copy.name).map((locale) => [
        locale,
        locale === "ko"
          ? "홈페이지가 새롭게 단장했습니다"
          : locale === "ja"
            ? "ホームページをリニューアルしました"
            : "Our website has a new home",
      ]),
    ),
    excerpt: copy.tagline,
    ...(heroImage ? { coverImage: heroImage } : {}),
    bodySections: validateSections([
      {
        id: "welcome-body",
        type: "rich-text",
        version: 1,
        props: {
          body: Object.fromEntries(
            Object.keys(copy.name).map((locale) => [
              locale,
              locale === "ko"
                ? "새 홈페이지에서는 객실 확인부터 예약까지 한 번에 진행하실 수 있습니다.\n\n공식 홈페이지에서 예약하시는 것이 언제나 가장 좋은 조건입니다. 앞으로 소식과 프로모션을 이 공간에서 전해드리겠습니다."
                : locale === "ja"
                  ? "新しいホームページでは、客室の確認からご予約まで一度に行えます。\n\n公式サイトでのご予約が常に最良の条件です。今後のお知らせやプロモーションはこちらでお伝えします。"
                  : "On our new website you can browse rooms and complete your booking in one place.\n\nBooking direct always gets you the best terms. News and offers will be posted here.",
            ]),
          ),
        },
      },
    ]),
    status: "published",
    publishedAt: new Date().toISOString(),
  };

  return {
    hotel,
    roomTypes,
    ratePlans,
    pages,
    posts: [welcomePost],
    redirects: mapOldPaths(extracted.internalPaths),
    mode,
    usedStockImages,
  };
}
