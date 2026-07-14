import Image, { type ImageProps } from "next/image";
import { isOptimizableImage, isRenderableImage } from "@/lib/images";

/**
 * Fail-soft next/image: tenant content can reference any image host, and
 * next/image throws (→ 500) for hosts missing from remotePatterns. Here:
 *  - allowlisted host → optimized as usual
 *  - other https host → rendered unoptimized (no optimizer, no crash)
 *  - non-https / garbage → rendered as nothing
 * Sections and tenant pages must use this instead of next/image directly.
 */
export function SafeImage(props: ImageProps) {
  const src = props.src;
  if (typeof src === "string") {
    if (!isRenderableImage(src)) return null;
    // no-referrer: migrated sites hotlink their old photos, and legacy hosts
    // often reject requests carrying a foreign referrer (hotlink protection)
    if (!isOptimizableImage(src)) {
      return <Image {...props} unoptimized referrerPolicy="no-referrer" />;
    }
  }
  return <Image {...props} />;
}
