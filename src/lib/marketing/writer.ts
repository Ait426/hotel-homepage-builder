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

export interface WriteInput {
  topic: string;
  kind: PostKind;
  /** 사장님 메모 — local facts the AI is allowed to state as specifics */
  ownerNotes?: string;
  /** property facts block for hotel guides (rooms, times, amenities) */
  facts?: string;
}

interface PostCopy {
  title: Localized<string>;
  excerpt: Localized<string>;
  body: Localized<string>;
  faqItems?: Array<{ question: Localized<string>; answer: Localized<string> }>;
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
        description: "3-6 paragraph body per locale, paragraphs separated by blank lines",
      },
      faqItems: {
        type: "array",
        maxItems: 6,
        description: "optional Q&A items (great for guides); question/answer are per-locale objects",
        items: {
          type: "object",
          required: ["question", "answer"],
          properties: {
            question: { type: "object" },
            answer: { type: "object" },
          },
        },
      },
    },
  },
} as const;

/** Pillar-specific writing rules — the difference between 콘텐츠 and 글 공장. */
function kindInstructions(input: WriteInput): string {
  switch (input.kind) {
    case "local_guide":
      return `This is a LOCAL AREA GUIDE — its value is insider knowledge.
GROUNDING RULE (strict): specific local facts — place names, distances, hours, prices, personal recommendations — may ONLY come from the OWNER NOTES below. If the notes lack specifics, write practically but generally and do NOT invent names or numbers.
Voice: a local host sharing what they actually know ("저희가 직접 가보는 곳" tone). Structure: short intro → the recommendations with practical detail → how to get there from the property → one closing tip.
OWNER NOTES:
${input.ownerNotes?.trim() || "(none provided — keep it general, no invented specifics)"}`;
    case "hotel_guide":
      return `This is a PROPERTY GUIDE — practical, informational content about staying here.
GROUNDING RULE (strict): use ONLY the property facts below (and owner notes, if any). Never invent facilities, times or policies.
Include 3-5 faqItems covering the questions guests actually ask about this topic.
PROPERTY FACTS:
${input.facts?.trim() || "(minimal facts available — keep to what is provided)"}
OWNER NOTES:
${input.ownerNotes?.trim() || "(none)"}`;
    default:
      return `Tone: polished hospitality marketing — warm, concrete, never exaggerated. If the topic implies an offer, mention that booking direct on the official site gets the best terms. Do not invent specific prices, dates or facilities that are not in the topic or owner notes.
OWNER NOTES:
${input.ownerNotes?.trim() || "(none)"}`;
  }
}

async function claudePost(hotel: Hotel, input: WriteInput): Promise<PostCopy | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const hotelName = pickLocalized(hotel.name, "ko", hotel.defaultLocale) ?? hotel.slug;
  const prompt = `Write a ${input.kind} post for the official website of "${hotelName}" (a ${hotel.propertyType} in Korea).
Topic: ${input.topic}
Locales to write: ${hotel.locales.join(", ")} (keys of every localized field).

${kindInstructions(input)}

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
    const output = data.content?.find((c) => c.type === "tool_use")?.input as
      | Partial<PostCopy>
      | undefined;
    if (!output?.title || !output.body) return null;
    return {
      title: output.title,
      excerpt: output.excerpt ?? {},
      body: output.body,
      faqItems: output.faqItems,
    };
  } catch {
    return null;
  }
}

function fallbackPost(hotel: Hotel, input: WriteInput): PostCopy {
  const hotelName = pickLocalized(hotel.name, "ko", hotel.defaultLocale) ?? hotel.slug;
  const notes = input.ownerNotes?.trim();
  const body =
    input.kind === "local_guide" && notes
      ? `${input.topic}\n\n${notes}\n\n숙소에서 자세한 안내를 도와드립니다. 궁금한 점은 언제든 문의해 주세요.`
      : `${input.topic}\n\n${notes ? `${notes}\n\n` : ""}자세한 내용은 ${hotelName}으로 문의해 주세요. 공식 홈페이지에서 예약하시는 것이 언제나 가장 좋은 조건입니다.`;
  return {
    title: { ko: input.topic.slice(0, 80) },
    excerpt: { ko: `${hotelName}이(가) 직접 전하는 이야기입니다.` },
    body: { ko: body },
  };
}

export async function writePost(
  hotel: Hotel,
  input: WriteInput,
): Promise<{ post: PostDef; mode: "ai" | "heuristic" }> {
  const ai = await claudePost(hotel, input);
  const copy = ai ?? fallbackPost(hotel, input);

  const sections: SectionInstance[] = [
    {
      id: `post-body-${randomUUID().slice(0, 8)}`,
      type: "rich-text",
      version: 1,
      props: { body: copy.body },
    },
  ];
  if (copy.faqItems?.length) {
    sections.push({
      id: `post-faq-${randomUUID().slice(0, 8)}`,
      type: "faq",
      version: 1,
      props: {
        heading: { ko: "자주 묻는 질문", en: "FAQ", ja: "よくあるご質問" },
        items: copy.faqItems,
      },
    });
  }

  const post: PostDef = {
    id: randomUUID(),
    hotelId: hotel.id,
    slug: slugFrom(
      copy.title.en ?? copy.title[hotel.defaultLocale] ?? copy.title.ko ?? input.topic,
    ),
    kind: input.kind,
    title: copy.title,
    excerpt: copy.excerpt,
    bodySections: validateSections(sections),
    status: "published",
    publishedAt: new Date().toISOString(),
  };

  return { post, mode: ai ? "ai" : "heuristic" };
}
