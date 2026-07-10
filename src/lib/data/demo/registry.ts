/**
 * In-memory tenant registry for demo mode.
 *
 * The onboarding wizard ("URL in → upgraded site out") registers generated
 * tenants here at runtime, so the whole Before/After flow works with zero
 * external services. Non-persistent by design — the Supabase adapter is the
 * durable path; this is the demo/dev/sales pathway.
 */

import type {
  Hotel,
  PageDef,
  RatePlan,
  RedirectRule,
  RoomType,
} from "@/lib/data/types";

export interface TenantBundle {
  hotel: Hotel;
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  pages: PageDef[];
  /** old-site URL → new path mappings (SEO migration) */
  redirects?: RedirectRule[];
}

const bundlesById = new Map<string, TenantBundle>();
const idByDomain = new Map<string, string>();
const idBySlug = new Map<string, string>();

export function registerBundle(bundle: TenantBundle): void {
  const { hotel } = bundle;
  bundlesById.set(hotel.id, bundle);
  idByDomain.set(hotel.primaryDomain, hotel.id);
  idBySlug.set(hotel.slug, hotel.id);
}

export function bundleById(hotelId: string): TenantBundle | undefined {
  return bundlesById.get(hotelId);
}

export function bundleByDomain(domain: string): TenantBundle | undefined {
  const id = idByDomain.get(domain);
  return id ? bundlesById.get(id) : undefined;
}

export function bundleBySlug(slug: string): TenantBundle | undefined {
  const id = idBySlug.get(slug);
  return id ? bundlesById.get(id) : undefined;
}

export function allBundles(): TenantBundle[] {
  return [...bundlesById.values()];
}

export function isSlugTaken(slug: string): boolean {
  return idBySlug.has(slug);
}
