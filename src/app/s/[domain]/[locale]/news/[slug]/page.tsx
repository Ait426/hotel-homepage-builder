import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SafeImage } from "@/components/ui/SafeImage";
import { getDataSource } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { activateLocale } from "@/lib/i18n/server";
import { pickLocalized } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { localeHref, requireHotel, resolveHotelByDomain } from "@/lib/tenant/resolve";
import { SectionRenderer } from "@/sections/SectionRenderer";

type Params = Promise<{ domain: string; locale: string; slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain, locale, slug } = await params;
  const hotel = await resolveHotelByDomain(domain);
  if (!hotel || !hotel.locales.includes(locale)) return {};
  const post = await getDataSource().getPostBySlug(hotel.id, decodeURIComponent(slug));
  if (!post) return {};
  return buildPageMetadata(hotel, locale, `/news/${post.slug}`, {
    title: pickLocalized(post.title, locale, hotel.defaultLocale),
    description: pickLocalized(post.excerpt, locale, hotel.defaultLocale),
    ogImage: post.coverImage,
  });
}

export default async function PostPage({ params }: { params: Params }) {
  const { domain, locale: rawLocale, slug } = await params;
  const hotel = await requireHotel(domain);
  const locale = activateLocale(hotel, rawLocale, ["news", slug]);
  const t = await getTranslations("news");

  const post = await getDataSource().getPostBySlug(hotel.id, decodeURIComponent(slug));
  if (!post) notFound();

  const title = pickLocalized(post.title, locale, hotel.defaultLocale);

  return (
    <article>
      <header className="mx-auto w-full max-w-3xl px-5 pt-16 text-center sm:px-8">
        <div className="mb-4 flex items-center justify-center gap-3 text-xs text-ink-muted">
          <span className="rounded-full bg-brand/5 px-2.5 py-1 font-medium uppercase tracking-[0.15em] text-brand">
            {t(`kind.${post.kind}`)}
          </span>
          {post.publishedAt ? (
            <time dateTime={post.publishedAt}>
              {formatDate(post.publishedAt.slice(0, 10), locale)}
            </time>
          ) : null}
        </div>
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
          {title}
        </h1>
      </header>

      {post.coverImage ? (
        <div className="mx-auto mt-10 w-full max-w-4xl px-5 sm:px-8">
          <div className="relative aspect-[21/9] overflow-hidden rounded-token">
            <SafeImage
              src={post.coverImage}
              alt={title ?? ""}
              fill
              priority
              sizes="(min-width: 896px) 896px, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      ) : null}

      {/* post bodies reuse the exact same section model as pages */}
      <SectionRenderer sections={post.bodySections} ctx={{ hotel, locale }} />

      <div className="pb-20 text-center">
        <Link
          href={localeHref(locale, "/news")}
          className="inline-block border border-ink/20 px-8 py-3 text-sm tracking-widest text-ink transition-colors hover:bg-ink hover:text-canvas"
        >
          ← {t("title")}
        </Link>
      </div>
    </article>
  );
}
