/**
 * Site generation: extracted old-site material → a full tenant bundle
 * (hotel + rooms + rate plans + sectioned pages).
 *
 * Two paths:
 *  - ANTHROPIC_API_KEY set → Claude generates localized copy + structure
 *    (forced tool-use so output is schema-shaped; we still validate every
 *    section against the zod registry — the schema is the quality floor).
 *  - no key / API failure → heuristic composer builds the site from the
 *    extracted material with the default preset. The flow never breaks.
 */

import "server-only";

import { randomUUID } from "crypto";
import type {
  Hotel,
  PageDef,
  RatePlan,
  RoomType,
  SectionInstance,
} from "@/lib/data/types";
import type { Localized } from "@/lib/i18n/locales";
import { SECTION_REGISTRY } from "@/sections/registry";
import type { ExtractedSite } from "./extract";

export interface GeneratedBundle {
  hotel: Hotel;
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  pages: PageDef[];
  /** 'ai' when Claude produced the copy, 'heuristic' for the fallback */
  mode: "ai" | "heuristic";
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
  return ascii.length >= 3 ? ascii.slice(0, 40) : `hotel-${randomUUID().slice(0, 8)}`;
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

function cleanName(extracted: ExtractedSite): string {
  const raw = extracted.siteName ?? extracted.title ?? "";
  // titles are often "호텔이름 | 슬로건" or "호텔이름 - 공식홈페이지"
  const first = raw.split(/[|\-–—:·]/)[0]?.trim();
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
  }>;
}

function heuristicCopy(extracted: ExtractedSite): CopyBundle {
  const name = cleanName(extracted);
  const tagline =
    extracted.description?.slice(0, 80) ??
    extracted.headings.find((h) => h !== name && h.length <= 60) ??
    "다시 태어난 우리 호텔";
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
    rooms: [
      {
        name: { ko: "스탠다드" },
        tagline: { ko: "합리적인 기본 객실" },
        occupancyBase: 2,
        occupancyMax: 2,
        basePrice: 90_000,
      },
      {
        name: { ko: "디럭스" },
        tagline: { ko: "여유로운 상위 객실" },
        occupancyBase: 2,
        occupancyMax: 3,
        basePrice: 130_000,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Claude path
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

async function claudeCopy(extracted: ExtractedSite): Promise<CopyBundle | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are regenerating a hotel's outdated website into a luxury-grade one.
Below is the raw material extracted from the old site. Write polished, honest copy in Korean (ko), English (en) and Japanese (ja). Never invent facilities or claims not supported by the material — elevate the tone, not the facts. If room information is missing, propose 2 modest generic room types (스탠다드/디럭스급) with realistic KRW prices for this kind of property.

OLD SITE MATERIAL
url: ${extracted.url}
title: ${extracted.title ?? "-"}
description: ${extracted.description ?? "-"}
headings: ${extracted.headings.join(" / ") || "-"}
text: ${extracted.paragraphs.join("\n").slice(0, 3000) || "-"}
phone: ${extracted.phone ?? "-"} / address: ${extracted.address ?? "-"}

Call emit_site exactly once with all locales filled.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ONBOARDING_MODEL ?? "claude-sonnet-5",
        max_tokens: 4000,
        tools: [SITE_TOOL_SCHEMA],
        tool_choice: { type: "tool", name: "emit_site" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.warn(`[onboarding] Claude API ${res.status} — falling back`);
      return null;
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; input?: Record<string, unknown> }>;
    };
    const tool = data.content?.find((c) => c.type === "tool_use");
    const input = tool?.input as Partial<CopyBundle> | undefined;
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
  } catch (error) {
    console.warn("[onboarding] Claude call failed — falling back:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// bundle assembly (shared by both paths)
// ---------------------------------------------------------------------------

export async function generateBundle(
  extracted: ExtractedSite,
  slug: string,
): Promise<GeneratedBundle> {
  const ai = await claudeCopy(extracted);
  const copy = ai ?? heuristicCopy(extracted);
  const mode: GeneratedBundle["mode"] = ai ? "ai" : "heuristic";

  const hotelId = randomUUID();
  const images = extracted.images;
  const heroImage = images[0];
  const galleryImages = images.slice(1, 7);

  const hotel: Hotel = {
    id: hotelId,
    slug,
    name: copy.name,
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
    totalRooms: 5,
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

  return { hotel, roomTypes, ratePlans, pages, mode };
}
