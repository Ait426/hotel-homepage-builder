/**
 * Section prop schemas — one exported schema per (type, version).
 *
 * These are the platform's editable-content contract: the admin editor
 * writes JSON that must satisfy these schemas, and the renderer refuses
 * anything that doesn't (fail-soft: the section is skipped, the page still
 * renders). Localized strings are {"ko": "...", "en": "..."} objects.
 */

import { z } from "zod";

/** {"ko": "...", "en": "..."} */
export const zLocalized = z.record(z.string());

export const zCta = z.object({
  label: zLocalized,
  /** site-relative path without locale prefix, e.g. "/booking" */
  href: z.string(),
});

export const heroV1 = z.object({
  image: z.string(),
  eyebrow: zLocalized.optional(),
  heading: zLocalized,
  subheading: zLocalized.optional(),
  cta: zCta.optional(),
  /** render the check-in/check-out search bar over the hero */
  showBookingBar: z.boolean().optional(),
});
export type HeroV1Props = z.infer<typeof heroV1>;

export const quoteBannerV1 = z.object({
  eyebrow: zLocalized.optional(),
  quote: zLocalized,
  attribution: zLocalized.optional(),
});
export type QuoteBannerV1Props = z.infer<typeof quoteBannerV1>;

export const roomsShowcaseV1 = z.object({
  heading: zLocalized.optional(),
  subheading: zLocalized.optional(),
  /** cap on rooms rendered; omit = all active room types */
  limit: z.number().int().positive().optional(),
});
export type RoomsShowcaseV1Props = z.infer<typeof roomsShowcaseV1>;

export const amenitiesV1 = z.object({
  heading: zLocalized.optional(),
  subheading: zLocalized.optional(),
  items: z
    .array(
      z.object({
        /** icon key, see src/components/ui/Icon.tsx */
        icon: z.string(),
        title: zLocalized,
        description: zLocalized.optional(),
      }),
    )
    .min(1),
});
export type AmenitiesV1Props = z.infer<typeof amenitiesV1>;

export const galleryV1 = z.object({
  heading: zLocalized.optional(),
  images: z
    .array(z.object({ url: z.string(), alt: zLocalized.optional() }))
    .min(1),
});
export type GalleryV1Props = z.infer<typeof galleryV1>;

export const diningV1 = z.object({
  heading: zLocalized.optional(),
  subheading: zLocalized.optional(),
  venues: z
    .array(
      z.object({
        name: zLocalized,
        description: zLocalized.optional(),
        image: z.string().optional(),
        /** free-form, already human-readable: "12:00–15:00" */
        hours: z.string().optional(),
        location: zLocalized.optional(),
      }),
    )
    .min(1),
});
export type DiningV1Props = z.infer<typeof diningV1>;

export const locationV1 = z.object({
  heading: zLocalized.optional(),
  description: zLocalized.optional(),
  /** e.g. Google Maps embed URL; omitted in environments that block iframes */
  mapEmbedUrl: z.string().optional(),
  /** show phone / email / address from hotel.contact */
  showContact: z.boolean().optional(),
});
export type LocationV1Props = z.infer<typeof locationV1>;

export const faqV1 = z.object({
  heading: zLocalized.optional(),
  items: z
    .array(z.object({ question: zLocalized, answer: zLocalized }))
    .min(1),
});
export type FaqV1Props = z.infer<typeof faqV1>;

export const ctaBannerV1 = z.object({
  image: z.string().optional(),
  heading: zLocalized,
  subheading: zLocalized.optional(),
  cta: zCta,
});
export type CtaBannerV1Props = z.infer<typeof ctaBannerV1>;

export const richTextV1 = z.object({
  heading: zLocalized.optional(),
  /** plain text; blank lines split paragraphs */
  body: zLocalized,
  align: z.enum(["left", "center"]).optional(),
});
export type RichTextV1Props = z.infer<typeof richTextV1>;

export const contactFormV1 = z.object({
  heading: zLocalized.optional(),
  intro: zLocalized.optional(),
});
export type ContactFormV1Props = z.infer<typeof contactFormV1>;
