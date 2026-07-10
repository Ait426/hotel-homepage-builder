/**
 * Design tokens (structural decision B, second half).
 *
 * A tenant's `hotels.theme` jsonb overrides these defaults; the resolved set
 * is emitted as CSS custom properties on :root by the tenant layout. Tailwind
 * utilities reference the same variables (see globals.css @theme), so every
 * section component is automatically on-brand — sections never hardcode
 * colors or fonts.
 */

import type { ThemeTokens } from "@/lib/data/types";

export const DEFAULT_THEME: Required<ThemeTokens> = {
  colors: {
    brand: "#16302e",
    brandInk: "#f7f4ec",
    accent: "#bf9b5e",
    canvas: "#faf8f3",
    surface: "#ffffff",
    ink: "#1d2321",
    inkMuted: "#65706c",
  },
  fonts: {
    display:
      "'Playfair Display', 'Noto Serif KR', Georgia, 'Times New Roman', serif",
    body: "'Pretendard Variable', Pretendard, 'Noto Sans KR', system-ui, -apple-system, sans-serif",
  },
  radius: "0.25rem",
};

/** Resolved theme → CSS custom properties for :root. */
export function themeCssVars(theme: ThemeTokens | undefined): string {
  const colors = { ...DEFAULT_THEME.colors, ...theme?.colors };
  const fonts = { ...DEFAULT_THEME.fonts, ...theme?.fonts };
  const radius = theme?.radius ?? DEFAULT_THEME.radius;

  const vars: Record<string, string | undefined> = {
    "--brand": colors.brand,
    "--brand-ink": colors.brandInk,
    "--accent": colors.accent,
    "--canvas": colors.canvas,
    "--surface": colors.surface,
    "--ink": colors.ink,
    "--ink-muted": colors.inkMuted,
    "--font-display-stack": fonts.display,
    "--font-body-stack": fonts.body,
    "--radius-base": radius,
  };

  const body = Object.entries(vars)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}:${String(v).replace(/[;{}<>]/g, "")}`)
    .join(";");

  return `:root{${body}}`;
}
