# Hotel Homepage Builder

하나의 코드베이스로 N개 호텔의 직예약 사이트를 찍어내는 **멀티테넌트 호텔 홈페이지 플랫폼**.

- 도메인 = 테넌트 (`hotel-a.com` → 해당 호텔의 config/콘텐츠/재고 로드)
- 다국어 (UI 문자열: next-intl / 호텔 콘텐츠: DB locale-jsonb)
- 객실 재고 원장 + 동시성 안전 예약 (오버부킹 방어)
- 고객 문의 inbox (스레드/메시지 + 이벤트 발행)
- SEO 규약 내장 (hreflang, canonical, JSON-LD, 테넌트별 sitemap/robots)
- 페이지 = 섹션 조합(JSON), 디자인 토큰으로 브랜드 커스텀

구조 결정의 근거와 전체 그림은 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** 참고.

## 실행

```bash
npm install
npm run dev
# http://localhost:3000 → 데모 테넌트(오로라 베이 호텔)로 연결됨
```

기본값은 **demo 데이터 소스**라 외부 서비스 없이 전체 플로우(홈/객실/예약/문의, ko·en·ja)가 동작한다.
예약·문의는 프로세스 메모리에만 저장된다(재시작 시 초기화).

### Supabase 연결 (운영 모드)

1. Supabase 프로젝트 생성 후 `supabase/migrations/*.sql`을 순서대로 적용
2. `supabase/seed.sql`로 데모 테넌트 시드(선택)
3. `.env.example` → `.env.local` 복사 후 값 채우기 (`DATA_SOURCE=supabase`)

## 구조

```
supabase/migrations/   DB 스키마: 테넌시(RLS) · 이벤트 outbox · CMS · 예약/재고 · inbox
src/middleware.ts      host → /s/{domain}/{locale}/... rewrite (DB-free)
src/lib/tenant/        도메인 → 호텔 해석, locale 가드
src/lib/data/          HotelDataSource 인터페이스 + demo/supabase 어댑터
src/lib/theme/         테넌트 디자인 토큰 → CSS 변수
src/lib/seo/           metadata/hreflang/JSON-LD 규약
src/sections/          섹션 라이브러리 (버저닝된 스키마 + 컴포넌트 + 레지스트리)
src/app/s/[domain]/    테넌트 라우트 (locale, rooms, booking, contact, sitemap, robots)
src/app/api/           예약/문의 쓰기 API (Host 헤더로 테넌트 해석)
messages/              UI 문자열 (ko/en/ja/zh)
```

## 검증

```bash
npm run typecheck
npm run build
```
