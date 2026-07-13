import Link from "next/link";
import { getDataSource } from "@/lib/data";
import { pickLocalized } from "@/lib/i18n/locales";

const TYPE_LABELS: Record<string, string> = {
  hotel: "호텔",
  motel: "모텔",
  resort: "리조트",
  pension: "펜션",
  guesthouse: "게스트하우스",
};

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const hotels = await getDataSource().listHotels();

  return (
    <div>
      <h1 className="mb-8 font-display text-2xl text-ink">숙소 목록</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {hotels.map((hotel) => (
          <Link
            key={hotel.id}
            href={`/admin/${hotel.slug}`}
            className="rounded-token bg-surface p-6 shadow-sm ring-1 ring-ink/5 transition-shadow hover:shadow-md"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full bg-brand/5 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-brand">
                {TYPE_LABELS[hotel.propertyType] ?? hotel.propertyType}
              </span>
              <span className="text-xs text-ink-muted">{hotel.primaryDomain}</span>
            </div>
            <p className="font-display text-lg text-ink">
              {pickLocalized(hotel.name, "ko", hotel.defaultLocale)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {hotel.locales.join(" · ")} — {hotel.status}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
