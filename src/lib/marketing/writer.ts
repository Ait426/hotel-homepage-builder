/**
 * Marketing automation, piece #1: the post writer.
 *
 * Give it a topic ("여름 얼리버드 프로모션", "가을 단풍 명소 안내") and it
 * produces a publishable, localized post whose body is ordinary section
 * instances — same rendering pipeline, same zod quality floor. Claude writes
 * when a key is present; a plain templated fallback keeps the flow alive
 * without one.
 *
 * Consumers: the /api/posts/generate endpoint today; scheduled campaign
 * automation (events/cron subscribers) later.
 */

import "server-only";

import { randomUUID } from "crypto";
import type { Hotel, PostDef, SectionInstance } from "@/lib/data/types";
import type { Localized } from "@/lib/i18n/locales";
import { pickLocalized } from "@/lib/i18n/locales";
import { SECTION_REGISTRY } from "@/sections/registry";

export type PostKind = PostDef["kind"];

function validateSections(sections: SectionInstance[]): SectionInstance[] {
  return sections.filter((section) => {
    const entry = SECTION_REGISTRY[section.type]?.[section.version];
    if (!entry) return false;
    const parsed = entry.schema.safeParse(section.props);
    if (parsed.success) section.props = parsed.data as Record<string, unknown>;
    return parsed.success;
  });
}

function slugFrom(text: string): string {
  const ascii = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");
  return ascii.length >= 3 ? ascii : `post-${randomUUID().slice(0, 8)}`;
}

interface PostCopy {
  title: Localized<string>;
  excerpt: Localized<string>;
  body: Localized<string>;
}

const POST_TOOL = {
  name: "emit_post",
  description: "Emit the marketing post.",
  input_schema: {
    type: "object",
    required: ["title", "excerpt", "body"],
    properties: {
      title: { type: "object", description: "post title per locale (keys: the hotel's locales)" },
      excerpt: { type: "object", description: "1-sentence teaser per locale" },
      body: {
        type: "object",
        description: "2-4 paragraph body per locale, paragraphs separated by blank lines",
      },
    },
  },
} as const;

async function claudePost(
  hotel: Hotel,
  topic: string,
  kind: PostKind,
): Promise<PostCopy | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const hotelName = pickLocalized(hotel.name, "ko", hotel.defaultLocale) ?? hotel.slug;
  const prompt = `Write a ${kind} post for the official website of "${hotelName}" (a ${hotel.propertyType} in Korea).
Topic: ${topic}
Locales to write: ${hotel.locales.join(", ")} (keys of every field).
Tone: polished hospitality marketing — warm, concrete, never exaggerated. If the topic implies an offer, mention that booking direct on the official site gets the best terms. Do not invent specific prices, dates or facilities that are not in the topic.
Call emit_post exactly once.`;

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
        max_tokens: 3000,
        tools: [POST_TOOL],
        tool_choice: { type: "tool", name: "emit_post" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: Array<{ type: string; input?: Record<string, unknown> }>;
    };
    const input = data.content?.find((c) => c.type === "tool_use")?.input as
      | Partial<PostCopy>
      | undefined;
    if (!input?.title || !input.body) return null;
    return { title: input.title, excerpt: input.excerpt ?? {}, body: input.body };
  } catch {
    return null;
  }
}

function fallbackPost(hotel: Hotel, topic: string): PostCopy {
  const hotelName = pickLocalized(hotel.name, "ko", hotel.defaultLocale) ?? hotel.slug;
  return {
    title: { ko: topic.slice(0, 80) },
    excerpt: { ko: `${hotelName}의 새로운 소식을 전해드립니다.` },
    body: {
      ko: `${topic}\n\n자세한 내용은 ${hotelName}으로 문의해 주세요. 공식 홈페이지에서 예약하시는 것이 언제나 가장 좋은 조건입니다.`,
    },
  };
}

export async function writePost(
  hotel: Hotel,
  topic: string,
  kind: PostKind,
): Promise<{ post: PostDef; mode: "ai" | "heuristic" }> {
  const ai = await claudePost(hotel, topic, kind);
  const copy = ai ?? fallbackPost(hotel, topic);

  const post: PostDef = {
    id: randomUUID(),
    hotelId: hotel.id,
    slug: slugFrom(
      copy.title.en ?? copy.title[hotel.defaultLocale] ?? copy.title.ko ?? topic,
    ),
    kind,
    title: copy.title,
    excerpt: copy.excerpt,
    bodySections: validateSections([
      {
        id: `post-body-${randomUUID().slice(0, 8)}`,
        type: "rich-text",
        version: 1,
        props: { body: copy.body },
      },
    ]),
    status: "published",
    publishedAt: new Date().toISOString(),
  };

  return { post, mode: ai ? "ai" : "heuristic" };
}
