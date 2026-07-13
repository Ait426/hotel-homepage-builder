import Link from "next/link";
import { notFound } from "next/navigation";
import { PostManager } from "@/components/admin/PostManager";
import { RoomEditor } from "@/components/admin/RoomEditor";
import { getDataSource } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { pickLocalized } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";

export default async function AdminHotelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = getDataSource();
  const hotel = await data.getHotelBySlug(decodeURIComponent(slug));
  if (!hotel) notFound();

  const [roomTypes, ratePlans, posts, reservations] = await Promise.all([
    data.listRoomTypes(hotel.id),
    data.listRatePlans(hotel.id),
    data.listAllPosts(hotel.id),
    data.listReservations(hotel.id),
  ]);

  const hotelName = pickLocalized(hotel.name, "ko", hotel.defaultLocale) ?? hotel.slug;
  const roomNameById = new Map(
    roomTypes.map((room) => [
      room.id,
      pickLocalized(room.content, "ko", hotel.defaultLocale)?.name ?? room.slug,
    ]),
  );

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink">{hotelName}</h1>
          <p className="mt-1 text-xs text-ink-muted">{hotel.primaryDomain}</p>
        </div>
        <a
          href={`/${hotel.defaultLocale}?_tenant=${hotel.primaryDomain}`}
          className="rounded-token border border-ink/15 px-4 py-2 text-xs tracking-wide text-ink hover:bg-ink hover:text-canvas"
        >
          사이트 보기 →
        </a>
      </div>

      {/* 객실 · 요금 검수 */}
      <section>
        <h2 className="mb-1 font-display text-lg text-ink">객실 · 요금</h2>
        <p className="mb-4 text-xs text-ink-muted">
          위저드가 만든 초안입니다 — 실제 객실 수와 요금으로 확정해 주세요.
        </p>
        <div className="space-y-4">
          {roomTypes.map((room) => (
            <RoomEditor
              key={room.id}
              hotelSlug={hotel.slug}
              room={{
                id: room.id,
                name: roomNameById.get(room.id) ?? room.slug,
                totalRooms: room.totalRooms,
                occupancyBase: room.occupancyBase,
                occupancyMax: room.occupancyMax,
              }}
              plans={ratePlans
                .filter((plan) => plan.roomTypeId === room.id)
                .map((plan) => ({
                  id: plan.id,
                  name: pickLocalized(plan.name, "ko", hotel.defaultLocale) ?? plan.code,
                  basePrice: plan.basePrice,
                }))}
            />
          ))}
        </div>
      </section>

      {/* 소식 · 마케팅 */}
      <section>
        <h2 className="mb-1 font-display text-lg text-ink">소식 · 마케팅</h2>
        <p className="mb-4 text-xs text-ink-muted">
          주제만 적으면 AI가 글을 작성합니다. 운영 모드에서는 초안으로 저장되어 발행 전 검수를 거칩니다.
        </p>
        <PostManager
          hotelSlug={hotel.slug}
          defaultLocale={hotel.defaultLocale}
          posts={posts.map((post) => ({
            id: post.id,
            slug: post.slug,
            kind: post.kind,
            title: pickLocalized(post.title, "ko", hotel.defaultLocale) ?? post.slug,
            status: post.status,
            publishedAt: post.publishedAt,
          }))}
        />
      </section>

      {/* 예약 */}
      <section>
        <h2 className="mb-4 font-display text-lg text-ink">
          예약 <span className="text-sm text-ink-muted">({reservations.length})</span>
        </h2>
        {reservations.length === 0 ? (
          <p className="rounded-token border border-ink/10 bg-surface p-8 text-center text-sm text-ink-muted">
            아직 예약이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-token bg-surface shadow-sm ring-1 ring-ink/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3">예약번호</th>
                  <th className="px-4 py-3">객실</th>
                  <th className="px-4 py-3">체크인</th>
                  <th className="px-4 py-3">체크아웃</th>
                  <th className="px-4 py-3">예약자</th>
                  <th className="px-4 py-3 text-right">금액</th>
                  <th className="px-4 py-3">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {reservations.map((reservation) => (
                  <tr key={reservation.code}>
                    <td className="px-4 py-3 font-mono text-xs">{reservation.code}</td>
                    <td className="px-4 py-3">
                      {roomNameById.get(reservation.roomTypeId) ?? "-"} ×{reservation.rooms}
                    </td>
                    <td className="px-4 py-3">{formatDate(reservation.checkIn, "ko")}</td>
                    <td className="px-4 py-3">{formatDate(reservation.checkOut, "ko")}</td>
                    <td className="px-4 py-3">{reservation.guestName}</td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(reservation.amountTotal, reservation.currency, "ko")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-brand/5 px-2 py-0.5 text-xs text-brand">
                        {reservation.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-muted">
        <Link href="/admin" className="underline">← 숙소 목록</Link>
      </p>
    </div>
  );
}
