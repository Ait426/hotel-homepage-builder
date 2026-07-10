# 아키텍처 — 호텔 홈페이지 팩토리

하나의 코드베이스로 N개 호텔의 특급 퀄리티 직예약 사이트를 찍어내는 멀티테넌트 플랫폼.
구조 논의에서 확정한 결정(A~E)과 우선순위(변경 비용이 큰 층부터)를 코드에 그대로 대응시킨 문서다.

## 우선순위 1 — 데이터 경계 (테넌트 격리 + 재고 원장)

**구현: `supabase/migrations/0001, 0004`**

- **단일 DB + `hotel_id` + RLS** (결정 A2). 모든 테넌트 소유 테이블에 `hotel_id`가 박혀 있고,
  Supabase RLS로 격리한다. 공개 사이트는 anon 정책(라이브 호텔의 published 콘텐츠만),
  관리자는 `hotel_members` 멤버십 기반 정책, 예약/문의 쓰기는 서비스 롤 API 루트만 통과한다.
- **재고 이중 구조** (결정 D).
  - `room_inventory` — `(room_type_id, date)` 단위 **카운트 원장** = 판매 가능 수량의 진실 원천.
    `total / sold / blocked` 3필드, `CHECK (sold + blocked <= total)`이 최후의 오버부킹 방어선.
  - `reservations` — 누가 무엇을 샀는지의 **기록 원장**. 가용성 계산에 직접 쓰이지 않고,
    원장의 감사/재구축 근거가 된다.
- **동시성**: `create_reservation()` RPC 하나가 유일한 직예약 쓰기 경로.
  한 트랜잭션 안에서 ① 숙박 기간의 원장 행을 **날짜순 `FOR UPDATE`** 로 잠그고(데드락 방지 순서 고정)
  ② 매 박 잔여·요금 검증 ③ `sold` 증가 ④ 예약 insert ⑤ outbox 이벤트 기록까지 수행한다.
  마지막 1실을 두 명이 잡으면 잠금에서 직렬화되어 늦은 쪽이 `sold_out`을 받는다.
  `p_expected_total`로 클라이언트 견적가를 재검증해 가격 위변조/변경도 잡는다(`price_changed`).
- **공개 가용성 뷰**: `room_availability` (security definer view) — 외부에는 `remaining`만 노출하고
  원장 원본(판매량)은 RLS로 잠근다.
- OTA 채널매니저는 명시적으로 스코프 밖. 단, 원장이 room_type 단위로 정규화되어 있어
  나중에 채널별 allotment가 `blocked`/별도 테이블로 붙을 수 있다.

## 우선순위 2 — URL 구조 (영구 계약)

**구현: `src/middleware.ts`, `src/lib/tenant/*`**

```
공개 URL   https://{hotel-domain}/{locale}/{path}     ← SEO가 보는 것, 영구 계약
내부 라우팅 /s/{domain}/{locale}/{path}                ← 미들웨어 rewrite
```

- 미들웨어는 **DB를 만지지 않는다**. host를 경로에 인코딩만 하고,
  도메인→호텔 해석은 라우트 레이어에서 요청 단위 캐시(`React cache`)로 수행한다.
- locale 첫 세그먼트는 *후보*일 뿐이다. `/about`처럼 locale 없이 들어오면
  페이지 레벨의 `activateLocale()`이 `/ko/about`으로 308 리다이렉트한다
  (테넌트의 default_locale은 미들웨어가 알 수 없으므로 라우트 레이어 소관).
- `sitemap.xml`/`robots.txt`도 테넌트별 라우팅을 태운다(호텔마다 자체 sitemap).
- API(`/api/*`)는 rewrite를 우회하고 Host 헤더에서 직접 테넌트를 해석한다.

## 우선순위 3 — 콘텐츠 모델 (페이지 = 섹션 조합)

**구현: `supabase/migrations/0003`, `src/sections/*`**

- 페이지는 섹션 인스턴스 배열(jsonb): `{id, type, version, props}` (결정 B).
- **버저닝 규약**: 발행된 버전의 스키마는 불변. 호환 깨지는 변경은 `version+1`을 레지스트리에
  추가하고, 기존 인스턴스는 마이그레이션 스크립트로 일괄 전환한다. 구버전 렌더러는
  전환이 끝날 때까지 유지 — "호텔 10개가 v1 히어로를 쓰는 중" 문제의 답.
- 렌더는 **fail-soft**: 모르는 타입/버전/스키마 불일치 섹션은 로그 남기고 건너뛴다.
  콘텐츠 실수가 테넌트 사이트를 500으로 쓰러뜨리면 안 된다.
- **특급 퀄리티 = 섹션 자체의 완성도, 커스텀 = 조합 + 디자인 토큰**.
  토큰(색/폰트/라운드)은 `hotels.theme` jsonb → CSS 변수(`src/lib/theme`) → Tailwind 유틸
  (`bg-brand`, `text-ink`, `font-display`…)로 흐른다. 섹션 컴포넌트는 브랜드 색을 하드코딩하지 않는다.
- 섹션 v1 라이브러리: hero, quote-banner, rooms-showcase(데이터 연동), amenities, gallery,
  dining, location, faq, cta-banner, rich-text, contact-form.

## 우선순위 4 — 이벤트 척추 (outbox)

**구현: `supabase/migrations/0002`**

- `events` 테이블 = outbox. 예약 생성/취소, 문의 수신, 메시지 발신이 **원 트랜잭션 안에서**
  `emit_event()`로 기록된다. 소비자는 아직 없다 — 그게 요점이다.
- 알림(알림톡/메일), 프라이싱 엔진, 채널 동기화, UniChat/Hermes 어댑터는 전부
  이 스트림의 **구독자**로 붙는다. 모듈끼리 직접 호출하지 않는다.

## i18n (결정 C)

- **UI 문자열**: `/messages/{ko,en,ja,zh}.json` + next-intl. 코드와 함께 배포.
- **호텔 콘텐츠**: DB jsonb에 locale 키(`{"ko": …, "en": …}`). 호텔 담당자가 코드 없이 수정.
  폴백 체인: 요청 locale → 호텔 default_locale → 첫 키 (`pickLocalized`).
- 호텔마다 `locales` 부분집합 + `default_locale`을 선택한다(플랫폼 superset: ko/en/ja/zh).

## SEO (결정이 아니라 규칙)

- 전 페이지 SSR + canonical + hreflang alternates (`buildPageMetadata`) — 항상 primary domain 기준.
- schema.org `Hotel`(홈) / `HotelRoom`(객실 상세) JSON-LD.
- 테넌트별 sitemap(hreflang 포함) + robots.txt. 예약 플로우는 noindex.
- `<html lang>`은 미들웨어가 넘긴 `x-locale`로 SSR 시점에 확정.

## 데이터 소스 추상화

`HotelDataSource` 인터페이스(`src/lib/data/types.ts`) 뒤에 어댑터 두 개:

| 어댑터 | 용도 |
|---|---|
| `demo` (기본) | 외부 서비스 없이 전체 플로우 구동. 결정적 가용성 생성, 인메모리 예약. 빌드/로컬/데모용 |
| `supabase` | 운영. 읽기는 anon(RLS), 쓰기는 서비스 롤 → RPC |

`DATA_SOURCE` env로 전환. 라우트/섹션은 인터페이스만 안다.

## 스코프 밖 (로드맵)

1. **관리자 콘솔** — 스키마(pages/page_revisions/hotel_members)는 준비됨. 섹션 편집기 + 재고/요금 캘린더 + inbox UI.
2. **결제(PG)** — `reservations.payment` jsonb + `pending → confirmed` 상태 전이가 자리. 토스페이먼츠 기준 설계 예정.
3. **알림 발송** — events 구독 워커(예약 확인 메일/알림톡).
4. **채널매니저** — 원장 위 채널별 allocation.
5. **ISR/캐싱** — 현재 전 라우트 dynamic. 트래픽 붙으면 콘텐츠 페이지부터 revalidate 도입.
