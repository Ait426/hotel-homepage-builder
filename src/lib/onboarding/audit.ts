/**
 * Site audit: 좋다/나쁘다의 기준.
 *
 * Scores the OLD site on the axes that actually decide whether a lodging
 * homepage earns bookings. The wizard shows this BEFORE generating anything:
 * a site that scores well is told so honestly — we don't upsell owners whose
 * homepage is already doing its job. That honesty is the sales pitch.
 *
 * Pure function over ExtractedSite (no network) so it can run anywhere the
 * extraction result exists.
 */

import type { ExtractedSite } from "./extract";

export interface AuditAxis {
  key: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface SiteAudit {
  /** 0-100 */
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  verdict: string;
  axes: AuditAxis[];
}

export function scoreSite(site: ExtractedSite): SiteAudit {
  const s = site.signals;
  const axes: AuditAxis[] = [];

  // 모바일 (20) — 숙소 예약의 대부분은 휴대폰에서 일어난다
  axes.push({
    key: "mobile",
    label: "모바일 대응",
    max: 20,
    score: s.viewport ? 20 : 0,
    note: s.viewport
      ? "휴대폰 화면에 맞게 표시됩니다."
      : "휴대폰에서 PC 화면이 그대로 나옵니다 — 숙소를 찾는 손님 대부분은 휴대폰으로 봅니다.",
  });

  // 온라인 예약 (15)
  axes.push({
    key: "booking",
    label: "온라인 예약",
    max: 15,
    score: s.bookingHint ? 15 : 0,
    note: s.bookingHint
      ? "온라인 예약 동선이 있습니다."
      : "온라인으로 예약할 방법이 보이지 않습니다 — 전화를 못 거는 밤과 새벽의 예약을 놓칩니다.",
  });

  // 사진 (15)
  const photoCount = site.images.length;
  const photoScore = photoCount >= 8 ? 15 : photoCount >= 4 ? 10 : photoCount >= 1 ? 5 : 0;
  axes.push({
    key: "photos",
    label: "사진",
    max: 15,
    score: photoScore,
    note:
      photoCount >= 8
        ? `사진 ${photoCount}장이 잘 노출되어 있습니다.`
        : photoCount >= 1
          ? `수집된 사진이 ${photoCount}장뿐입니다 — 손님은 사진으로 숙소를 고릅니다.`
          : "사진을 찾지 못했습니다 — 사진 없는 숙소는 선택받기 어렵습니다.",
  });

  // 검색 노출 기본기 (20)
  const seoParts = [
    { ok: Boolean(site.title), label: "페이지 제목" },
    { ok: Boolean(site.description), label: "검색 설명문" },
    { ok: s.ogTags, label: "공유 미리보기" },
    { ok: s.jsonLd, label: "구조화 데이터" },
  ];
  const seoScore = seoParts.filter((p) => p.ok).length * 5;
  const seoMissing = seoParts.filter((p) => !p.ok).map((p) => p.label);
  axes.push({
    key: "seo",
    label: "검색 노출 기본기",
    max: 20,
    score: seoScore,
    note:
      seoMissing.length === 0
        ? "구글·네이버가 읽을 기본 정보가 갖춰져 있습니다."
        : `${seoMissing.join(", ")}이(가) 없습니다 — 검색 결과에서 손해를 봅니다.`,
  });

  // 다국어 (10)
  axes.push({
    key: "i18n",
    label: "다국어",
    max: 10,
    score: s.hreflang ? 10 : 0,
    note: s.hreflang
      ? "외국어 안내가 준비되어 있습니다."
      : "외국인 손님이 검색해도 한국어 페이지만 나옵니다.",
  });

  // 보안 접속 (10)
  axes.push({
    key: "security",
    label: "보안 접속(HTTPS)",
    max: 10,
    score: s.https ? 10 : 0,
    note: s.https
      ? "안전한 https 접속입니다."
      : "http 접속입니다 — 브라우저가 주소창에 '안전하지 않음'을 띄웁니다.",
  });

  // 최신 기술 (10)
  const techIssues = [
    s.frameset ? "프레임셋" : null,
    s.flash ? "플래시" : null,
    s.legacyCharset ? "구형 문자 인코딩" : null,
  ].filter(Boolean) as string[];
  const techScore = Math.max(0, 10 - (s.frameset ? 5 : 0) - (s.flash ? 3 : 0) - (s.legacyCharset ? 2 : 0));
  axes.push({
    key: "tech",
    label: "최신 기술",
    max: 10,
    score: techScore,
    note:
      techIssues.length === 0
        ? "최신 웹 표준으로 만들어져 있습니다."
        : `${techIssues.join(", ")} 등 오래된 기술이 남아 있습니다 — 일부 기기에서 깨져 보일 수 있습니다.`,
  });

  const total = axes.reduce((sum, a) => sum + a.score, 0);
  const grade = total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "F";

  const verdict =
    total >= 80
      ? "지금 홈페이지도 잘 관리되고 있습니다. 무리해서 바꾸실 필요는 없어요 — 아래 부족한 항목만 보완해도 충분합니다."
      : total >= 55
        ? "기본기는 갖췄지만, 예약으로 이어지는 길목에서 손님을 놓치고 있습니다. 부족한 항목을 채우면 효과가 분명합니다."
        : "지금 홈페이지가 손님을 돌려보내고 있을 가능성이 높습니다. 업그레이드 효과가 가장 큰 구간입니다.";

  return { total, grade, verdict, axes };
}
