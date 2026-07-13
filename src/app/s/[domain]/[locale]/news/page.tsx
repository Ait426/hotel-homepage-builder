import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SafeImage } from "@/components/ui/SafeImage";
import { getDataSource } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { activateLocale } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { localeHref, requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";

type Params = Promise<{ domain: string; locale: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  const t = await getTranslations({ locale, namespace: "news" });
  return buildPageMetadata(hotel, locale, "/news", { title: t("title") });
}

export default async function NewsPage({ params }: { params: Params }) {
  const { domain, locale: rawLocale } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale, ["news"]);
  const t = await getTranslations("news");

  const posts = await getDataSource().listPosts(hotel.id);

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
      <div className="mb-12 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">{t("title")}</h1>
      </div>

      {posts.length === 0 ? (
        <p className="py-20 text-center text-sm text-ink-muted">{t("empty")}</p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const title = pickLocalized(post.title, locale, hotel.defaultLocale);
            const excerpt = pickLocalized(post.excerpt, locale, hotel.defaultLocale);
            return (
              <Link
                key={post.id}
                href={localeHref(locale, `/news/${post.slug}`)}
                className="group overflow-hidden rounded-token bg-surface shadow-sm ring-1 ring-ink/5 transition-shadow hover:shadow-lg"
              >
                {post.coverImage ? (
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <SafeImage
                      src={post.coverImage}
                      alt={title ?? ""}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                ) : null}
                <div className="p-6">
                  <div className="mb-3 flex items-center gap-3 text-xs text-ink-muted">
                    <span className="rounded-full bg-brand/5 px-2.5 py-1 font-medium uppercase tracking-[0.15em] text-brand">
                      {t(`kind.${post.kind}`)}
                    </span>
                    {post.publishedAt ? (
                      <time dateTime={post.publishedAt}>
                        {formatDate(post.publishedAt.slice(0, 10), locale)}
                      </time>
                    ) : null}
                  </div>
                  <h2 className="font-display text-xl leading-snug text-ink">{title}</h2>
                  {excerpt ? (
                    <p className="mt-2 text-sm leading-6 text-ink-muted">{excerpt}</p>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
