/**
 * Section registry — the single lookup from (type, version) to schema +
 * component. Adding a section type = one schema, one component, one entry
 * here; every tenant can then use it in page JSON immediately.
 */

import { AmenitiesV1 } from "./components/Amenities";
import { ContactFormSectionV1 } from "./components/ContactFormSection";
import { CtaBannerV1 } from "./components/CtaBanner";
import { DiningV1 } from "./components/Dining";
import { FaqV1 } from "./components/Faq";
import { GalleryV1 } from "./components/Gallery";
import { HeroV1 } from "./components/Hero";
import { LocationV1 } from "./components/Location";
import { QuoteBannerV1 } from "./components/QuoteBanner";
import { RichTextV1 } from "./components/RichText";
import { RoomsShowcaseV1 } from "./components/RoomsShowcase";
import * as s from "./schemas";
import type { SectionVersions } from "./types";

export const SECTION_REGISTRY: Record<string, SectionVersions> = {
  hero: { 1: { schema: s.heroV1, Component: HeroV1 } },
  "quote-banner": { 1: { schema: s.quoteBannerV1, Component: QuoteBannerV1 } },
  "rooms-showcase": { 1: { schema: s.roomsShowcaseV1, Component: RoomsShowcaseV1 } },
  amenities: { 1: { schema: s.amenitiesV1, Component: AmenitiesV1 } },
  gallery: { 1: { schema: s.galleryV1, Component: GalleryV1 } },
  dining: { 1: { schema: s.diningV1, Component: DiningV1 } },
  location: { 1: { schema: s.locationV1, Component: LocationV1 } },
  faq: { 1: { schema: s.faqV1, Component: FaqV1 } },
  "cta-banner": { 1: { schema: s.ctaBannerV1, Component: CtaBannerV1 } },
  "rich-text": { 1: { schema: s.richTextV1, Component: RichTextV1 } },
  "contact-form": { 1: { schema: s.contactFormV1, Component: ContactFormSectionV1 } },
};
