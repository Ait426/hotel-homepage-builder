/**
 * Minimal inline icon set (stroke style, 24×24 viewBox). Keyed by name so
 * amenity lists in DB content can reference icons without shipping assets.
 * Unknown keys fall back to a dot — content never breaks the render.
 */

const PATHS: Record<string, string> = {
  wifi: "M2.5 9.5a15 15 0 0 1 19 0M5.5 13a10 10 0 0 1 13 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01",
  pool: "M3 16c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0M3 20c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0M14 4v9M8 4v9M8 7h6M8 10h6",
  spa: "M12 3c1.8 2 2.7 4.2 2.7 6.4 0 2.9-1.2 4.6-2.7 6.1-1.5-1.5-2.7-3.2-2.7-6.1C9.3 7.2 10.2 5 12 3ZM4 13.5c2.4.4 4.4 1.4 5.9 2.9 1.1 1.1 1.8 2.4 2.1 3.9-2.4-.4-4.4-1.4-5.9-2.9A8.6 8.6 0 0 1 4 13.5ZM20 13.5c-2.4.4-4.4 1.4-5.9 2.9a8.6 8.6 0 0 0-2.1 3.9c2.4-.4 4.4-1.4 5.9-2.9a8.6 8.6 0 0 0 2.1-3.9Z",
  gym: "M6.5 9v6M9.5 7.5v9M14.5 7.5v9M17.5 9v6M2.5 12h2M19.5 12h2M9.5 12h5",
  kids: "M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM12 8v5m0 0-3.5 7M12 13l3.5 7M6 10.5 12 9l6 1.5",
  dining: "M5 3v7a2 2 0 0 0 2 2v9M9 3v7a2 2 0 0 1-2 2M15.5 3c-1.4 1.6-2 3.6-2 6 0 1.6.8 2.5 2 3v9m0-18c1.8 1.2 3 3.4 3 6 0 1.6-1.2 2.6-3 3",
  bathtub: "M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2Zm2 0V5.5A1.5 1.5 0 0 1 7.5 4h.8A1.7 1.7 0 0 1 10 5.7V6M7 19.5 6 21m11-1.5 1 1.5",
  terrace: "M12 3 3 9h18l-9-6Zm0 6v11M5 9v11m14-11v11M3 20h18M7.5 14h9",
  oceanview: "M3 17c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0M12 4a5.5 5.5 0 0 1 5.5 5.5c0 1.2-.3 2.2-1 3.5h-9c-.7-1.3-1-2.3-1-3.5A5.5 5.5 0 0 1 12 4Z",
  espresso: "M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8Zm11 1h1.5a2.5 2.5 0 0 1 0 5H16M8 5c0-.8.5-1 .5-1.8M11.5 5c0-.8.5-1 .5-1.8",
  minibar: "M7 3h10v18H7V3Zm0 8h10M10 6.5v2m0 5v2",
  jacuzzi: "M4 13h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2Zm3-3c0-1.5 1-1.5 1-3m3.5 3c0-1.5 1-1.5 1-3m3.5 3c0-1.5 1-1.5 1-3",
  butler: "M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0v3m-6 10a6 6 0 0 1 12 0M12 11l-1.5 3h3L12 18",
  kitchenette: "M4 3h16v8H4V3Zm0 8v10h16V11M8 6.5h.01M12 6.5h.01M8 15v3",
  parking: "M6 21V4a1 1 0 0 1 1-1h6a5 5 0 0 1 0 10H6",
  concierge: "M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm0 0v2m-8 9a8 8 0 0 1 16 0H4Zm-1 3h18",
};

export function Icon({
  name,
  className = "h-6 w-6",
}: {
  name: string;
  className?: string;
}) {
  const d = PATHS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {d ? <path d={d} /> : <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** Localized amenity labels for room detail pages. */
export const AMENITY_LABELS: Record<string, Record<string, string>> = {
  wifi: { ko: "무료 와이파이", en: "Free Wi-Fi", ja: "無料Wi-Fi", zh: "免费Wi-Fi" },
  oceanview: { ko: "오션뷰", en: "Ocean View", ja: "オーシャンビュー", zh: "海景" },
  espresso: { ko: "커피 머신", en: "Espresso Machine", ja: "コーヒーマシン", zh: "咖啡机" },
  bathtub: { ko: "욕조", en: "Bathtub", ja: "バスタブ", zh: "浴缸" },
  minibar: { ko: "미니바", en: "Minibar", ja: "ミニバー", zh: "迷你吧" },
  terrace: { ko: "프라이빗 테라스", en: "Private Terrace", ja: "プライベートテラス", zh: "私人露台" },
  kitchenette: { ko: "미니 주방", en: "Kitchenette", ja: "ミニキッチン", zh: "小厨房" },
  kids: { ko: "키즈 어메니티", en: "Kids Amenities", ja: "キッズアメニティ", zh: "儿童用品" },
  jacuzzi: { ko: "자쿠지", en: "Jacuzzi", ja: "ジャグジー", zh: "按摩浴缸" },
  butler: { ko: "버틀러 서비스", en: "Butler Service", ja: "バトラーサービス", zh: "管家服务" },
  dining: { ko: "전용 다이닝", en: "Private Dining", ja: "専用ダイニング", zh: "专属餐厅" },
  spa: { ko: "스파", en: "Spa", ja: "スパ", zh: "水疗" },
  pool: { ko: "수영장", en: "Pool", ja: "プール", zh: "游泳池" },
  gym: { ko: "피트니스", en: "Fitness", ja: "フィットネス", zh: "健身房" },
  parking: { ko: "주차", en: "Parking", ja: "駐車場", zh: "停车场" },
};
