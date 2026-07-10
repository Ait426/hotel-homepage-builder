/**
 * Section component contract.
 *
 * A section receives:
 *  - ctx: the tenant + active locale (never fetch these yourself)
 *  - props: validated against the section's zod schema for its version
 *
 * Sections are server components; data-driven sections (rooms-showcase …)
 * may fetch through getDataSource() using ctx.hotel.id.
 *
 * Versioning rule (decision B/3순위): a published version's schema is
 * immutable. Breaking prop changes create version N+1 alongside N — old
 * pages keep rendering until a migration script rewrites their instances.
 */

import type { ReactNode } from "react";
import type { ZodType } from "zod";
import type { Hotel } from "@/lib/data/types";

export interface SectionContext {
  hotel: Hotel;
  locale: string;
}

export type SectionComponent<P> = (args: {
  ctx: SectionContext;
  props: P;
}) => ReactNode | Promise<ReactNode>;

export interface SectionVersion<P> {
  schema: ZodType<P>;
  Component: SectionComponent<P>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SectionVersions = Record<number, SectionVersion<any>>;
