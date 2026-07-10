import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

/** Tenant-scoped 404 (unknown CMS path / room slug) — keeps the site chrome. */
export default async function TenantNotFound() {
  const [t, locale] = await Promise.all([getTranslations("notFound"), getLocale()]);

  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-accent">404</p>
      <h1 className="font-display text-3xl text-ink">{t("title")}</h1>
      <p className="max-w-md text-sm text-ink-muted">{t("body")}</p>
      <Link
        href={`/${locale}`}
        className="mt-4 border border-ink/20 px-8 py-3 text-sm tracking-widest text-ink transition-colors hover:bg-ink hover:text-canvas"
      >
        {t("cta")}
      </Link>
    </section>
  );
}
