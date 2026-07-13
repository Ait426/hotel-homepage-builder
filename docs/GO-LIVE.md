# GO-LIVE 런북 — "도메인만 있으면 몇 시간 안에 완성"

0에서 운영까지. 플랫폼 셋업(1회)과 호텔 온보딩(호텔마다 반복)을 분리해서 적는다.

---

## A. 플랫폼 셋업 — 최초 1회 (~1시간)

### 1. Supabase 프로젝트
1. 프로젝트 생성 → SQL Editor에 `supabase/all_migrations.sql` **전체를 한 번에 붙여넣고 실행**
   (개별 파일로 하려면 `supabase/migrations/0001~0010.sql`을 순서대로)
2. (선택) `supabase/seed.sql` — 데모 테넌트(오로라 베이)
3. Settings → API에서 URL / anon key / service_role key 확보

### 2. Vercel 배포
1. 이 레포 연결 → 배포
2. 환경변수 설정:

| 변수 | 값 |
|---|---|
| `DATA_SOURCE` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `PLATFORM_APEX_DOMAIN` | 예: `staybook.kr` (무료 서브도메인용 apex) |
| `ANTHROPIC_API_KEY` | (선택) AI 카피라이팅 활성화 |

### 3. 와일드카드 도메인 (무료 구간의 핵심)
1. Vercel 프로젝트 → Domains → `*.staybook.kr` 추가 (+ `staybook.kr`)
2. DNS(도메인 등록기관)에서: `*` CNAME → `cname.vercel-dns.com`
3. 이후 모든 신규 호텔은 `{slug}.staybook.kr`로 **0초 배포** — 추가 작업 없음

---

## B. 호텔 온보딩 — 호텔마다 (~몇 분 + 검수)

1. `/start` 접속 → 기존 홈페이지 URL 입력
2. 자동 진행: 크롤링(이름/사진/연락처/구 URL 목록) → AI 생성(ko/en/ja) → DB 저장
   → `{slug}.{apex}` 즉시 라이브 (재고 365일 오픈, 구 URL 301 매핑 포함)
3. **사장님 검수** (필수 — 자동화가 대신 못 하는 부분):
   - 객실 이름·요금 확인/수정 (`rate_plans.base_price`, `daily_rates`)
   - 객실 수 확인 (`room_types.total_rooms` — 재고 원장과 직결)
   - 사진 교체/보강
4. 예약 모드 선택: `hotels.settings.bookingMode` = `request`(기본 권장) | `instant`

> 관리자 콘솔 전까지 검수는 Supabase 대시보드에서 직접. 콘솔이 이 단계를 UI로 흡수한다.

---

## C. 커스텀 도메인 연결 — 유료 구간 (~10분 + DNS 전파)

사장님 도메인 `myhotel.co.kr`을 연결할 때:

1. **Vercel**: 프로젝트 → Domains → `myhotel.co.kr` 추가 (+`www.`)
2. **DB**: `hotel_domains`에 행 추가
   ```sql
   insert into hotel_domains (hotel_id, domain, is_primary, verified_at)
   values ('<hotel-id>', 'myhotel.co.kr', true, now());
   -- 기존 {slug}.{apex} 행의 is_primary는 false로
   ```
3. **사장님 DNS** (가비아/후이즈/카페24 관리 화면):
   - A 레코드 `@` → `76.76.21.21` (또는 CNAME `www` → `cname.vercel-dns.com`)
   - **A 레코드만 변경 — MX(메일)는 건드리지 않으므로 메일은 안 끊김** ← 사장님 안심 포인트
4. SSL은 자동 발급(수 분). DNS 전파는 보통 수 분~수 시간.
5. 구 사이트에서 옮겨온 301 매핑은 이미 DB에 있으므로, 도메인이 붙는 순간
   옛 검색 결과 링크들이 전부 새 사이트로 흐른다.

---

## D. 타임라인 요약

| 단계 | 소요 |
|---|---|
| URL 입력 → 생성 → 서브도메인 라이브 | **~2분** |
| 사장님 검수 (요금/사진) | 몇십 분 ~ |
| 커스텀 도메인 (DNS 변경 + 전파) | 10분 작업 + 전파 대기 |
| **합계** | **몇 시간 안** ✅ |

---

## E. 남은 자동화 (로드맵)

- 콘솔에서 도메인 연결 버튼 (Vercel Domains API) + TXT 소유 검증
- 검수 단계의 콘솔 UI (요금표/재고/사진 교체)
- 알림톡/메일 워커 (예약 이벤트 구독)
