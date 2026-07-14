/**
 * Image host policy — single source of truth shared by next.config.ts
 * (optimizer allowlist) and SafeImage (render-time guard).
 *
 * Tenant content is data, so an editor can save an image URL on any host.
 * next/image throws at render for non-allowlisted hosts, which would 500 a
 * tenant page — SafeImage downgrades those to unoptimized rendering instead.
 */

export const OPTIMIZED_IMAGE_HOSTS: RegExp[] = [
  /(^|\.)supabase\.co$/,
  /^images\.unsplash\.com$/,
];

/** true when next/image may run this src through the optimizer */
export function isOptimizableImage(src: string): boolean {
  // "//host/x" is a protocol-relative URL, NOT a local asset — it points at
  // an arbitrary external host. Only a single leading slash is site-relative.
  if (src.startsWith("//")) return false;
  if (src.startsWith("/")) return true; // local asset
  try {
    const url = new URL(src);
    return (
      url.protocol === "https:" &&
      OPTIMIZED_IMAGE_HOSTS.some((re) => re.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** true when the src is renderable at all (https or site-relative) */
export function isRenderableImage(src: string): boolean {
  // reject protocol-relative "//host/x" before the local-asset shortcut —
  // it is not a local path and its effective scheme is unknown
  if (src.startsWith("//")) return false;
  if (src.startsWith("/")) return true;
  try {
    return new URL(src).protocol === "https:";
  } catch {
    return false;
  }
}
