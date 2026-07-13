/**
 * Topic suggestion engine — the anti-content-factory.
 *
 * Instead of a blank "topic" box, the console offers a curated editorial
 * calendar: evergreen hotel guides per property type + season-aware local
 * guide starters. Suggestions are STARTERS — the owner's notes supply the
 * real substance, which is exactly what E-E-A-T rewards.
 */

import type { PropertyType } from "@/lib/data/types";

export interface TopicSuggestion {
  kind: "hotel_guide" | "local_guide";
  topic: string;
  /** why this topic, shown as tooltip/help */
  hint: string;
}

const HOTEL_GUIDES: Record<PropertyType, string[]> = {
  hotel: [
    "체크인·체크아웃 완벽 안내 (얼리 체크인 팁 포함)",
    "객실 타입별 선택 가이드 — 누구에게 어떤 방이 맞을까",
    "부대시설 100% 활용법",
    "아이와 함께 묵을 때 알아두면 좋은 것들",
  ],
  motel: [
    "처음 오시는 분을 위한 이용 안내 (주차·체크인)",
    "객실 등급별 차이 한눈에 보기",
    "장기 투숙 안내와 할인",
  ],
  resort: [
    "리조트 시설 완전 정복 — 하루 일과 추천",
    "가족 여행 준비물 체크리스트",
    "시즌별 프로그램 안내",
  ],
  pension: [
    "바비큐 이용 안내 — 준비물과 이용 시간",
    "독채 사용 팁 — 처음 오시는 분들께",
    "반려동물 동반 안내",
  ],
  guesthouse: [
    "체크인부터 조식까지 — 이용 안내",
    "공용 공간 이용 가이드",
    "장기 여행자를 위한 안내",
  ],
};

const LOCAL_GUIDES_BY_SEASON: Record<"spring" | "summer" | "fall" | "winter", string[]> = {
  spring: [
    "봄 산책하기 좋은 곳 — 걸어서/차로 갈 수 있는 코스",
    "벚꽃 시즌, 사람 없는 시간대와 명소",
  ],
  summer: [
    "여름 물놀이·해변 가이드 — 주차와 꿀팁까지",
    "더위 피하기 좋은 실내 명소",
  ],
  fall: [
    "가을 단풍·억새 명소와 드라이브 코스",
    "가을 제철 음식, 어디서 먹을까",
  ],
  winter: [
    "겨울 일출·일몰 명소와 따뜻한 카페",
    "눈 오는 날 가기 좋은 곳",
  ],
};

const LOCAL_GUIDES_EVERGREEN = [
  "우리 동네 맛집 — 사장님이 실제로 가는 곳만",
  "비 오는 날 갈 만한 곳",
  "아이와 함께라면 여기 — 연령대별 추천",
  "대중교통으로 오시는 길 완벽 가이드",
];

function season(month: number): keyof typeof LOCAL_GUIDES_BY_SEASON {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "fall";
  return "winter";
}

export function suggestTopics(
  propertyType: PropertyType,
  month: number,
): TopicSuggestion[] {
  const hotelTopics = HOTEL_GUIDES[propertyType].map((topic) => ({
    kind: "hotel_guide" as const,
    topic,
    hint: "숙소의 실제 정보를 바탕으로 작성됩니다",
  }));
  const localTopics = [
    ...LOCAL_GUIDES_BY_SEASON[season(month)],
    ...LOCAL_GUIDES_EVERGREEN.slice(0, 2),
  ].map((topic) => ({
    kind: "local_guide" as const,
    topic,
    hint: "사장님 메모의 실제 정보만 사용됩니다",
  }));

  return [...localTopics, ...hotelTopics];
}
