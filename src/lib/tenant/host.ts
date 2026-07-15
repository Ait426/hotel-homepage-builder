/**
 * Host handling shared by the middleware (edge) and API routes (node).
 * Pure string logic — must stay dependency-free and edge-safe.
 */

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** Hosts that aren't tenant domains — mapped to the default demo tenant. */
export function isPlatformHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".vercel.app")
  );
}

/**
 * Strict shape check for anything that ends up inside the middleware's
 * rewrite path (`/s/{domain}/…`): lowercase dot-separated LDH labels only.
 * No slashes, no empty labels (so no ".." path segments), no ports, no
 * percent-escapes — a value that passes cannot steer the rewrite outside
 * the /s/ namespace (e.g. into /admin, whose auth gate a rewrite would
 * otherwise skip).
 */
export function isValidTenantDomain(value: string): boolean {
  if (!value || value.length > 253) return false;
  return value
    .split(".")
    .every((label) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export function tenantDomainFromHost(rawHost: string | null): string {
  // Demo mode falls back to the demo tenant so localhost "just works".
  // A configured (Supabase) deployment must set DEFAULT_TENANT_DOMAIN
  // explicitly — silently serving the demo hotel on an unconfigured
  // production host would leak demo canonicals/sitemaps to crawlers.
  const demoMode =
    (process.env.DATA_SOURCE ??
      (process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "demo")) === "demo";
  const fallback =
    process.env.DEFAULT_TENANT_DOMAIN ?? (demoMode ? "demo.staybook.local" : "");
  const host = normalizeHost(rawHost ?? "");
  return !host || isPlatformHost(host) ? fallback : host;
}
