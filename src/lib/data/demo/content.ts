/**
 * Demo tenant: "Aurora Bay Hotel & Spa" — a fully composed luxury property
 * exercising every platform feature (3 locales, 4 room types, 6 rate plans,
 * sectioned pages). Doubles as the reference for what a real tenant's rows
 * look like (see supabase/seed.sql).
 */

import type {
  Hotel,
  PageDef,
  PostDef,
  RatePlan,
  RoomType,
} from "@/lib/data/types";

const img = (id: string, w = 1800) =>
  `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;

export const DEMO_HOTEL: Hotel = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "aurora-bay",
  name: {
    ko: "오로라 베이 호텔 & 스파",
    en: "Aurora Bay Hotel & Spa",
    ja: "オーロラベイ ホテル＆スパ",
  },
  propertyType: "hotel",
  defaultLocale: "ko",
  locales: ["ko", "en", "ja"],
  currency: "KRW",
  timezone: "Asia/Seoul",
  theme: {
    colors: {
      brand: "#16302e",
      brandInk: "#f7f4ec",
      accent: "#bf9b5e",
      canvas: "#faf8f3",
      surface: "#ffffff",
      ink: "#1d2321",
      inkMuted: "#65706c",
    },
    radius: "0.125rem",
  },
  contact: {
    phone: "+82-31-000-0000",
    email: "stay@aurorabay.example",
    address: {
      ko: "경기도 평택시 현덕면 바닷가길 1",
      en: "1 Badatga-gil, Hyeondeok-myeon, Pyeongtaek-si, Gyeonggi-do, Korea",
      ja: "京畿道平沢市玄徳面バダッカギル1",
    },
    geo: { lat: 36.9421, lng: 126.8272 },
    checkIn: "15:00",
    checkOut: "11:00",
  },
  seo: {
    title: {
      ko: "오로라 베이 호텔 & 스파 | 서해를 품은 오션프런트 리조트",
      en: "Aurora Bay Hotel & Spa | Oceanfront Resort on the West Sea",
      ja: "オーロラベイ ホテル＆スパ | 西海を望むオーシャンフロントリゾート",
    },
    description: {
      ko: "전 객실 오션뷰, 인피니티 풀과 시그니처 스파. 공식 홈페이지 예약 시 최저가를 보장합니다.",
      en: "All-ocean-view rooms, an infinity pool and a signature spa. Best rate guaranteed when you book direct.",
      ja: "全室オーシャンビュー、インフィニティプールとシグネチャースパ。公式サイト予約でベストレート保証。",
    },
    ogImage: img("photo-1571896349842-33c89424de2d"),
  },
  status: "live",
  primaryDomain: "demo.staybook.local",
};

export const DEMO_ROOM_TYPES: RoomType[] = [
  {
    id: "21111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    slug: "deluxe-ocean",
    code: "DLX-O",
    sort: 10,
    content: {
      ko: {
        name: "디럭스 오션",
        tagline: "서해 일몰이 창을 가득 채우는 객실",
        description:
          "38㎡의 여유로운 공간에 킹 베드와 전면 통유리를 갖춘 대표 객실입니다. 모든 디럭스 오션은 서향으로 배치되어 객실 안에서 일몰을 감상할 수 있습니다.\n\n천연 원목과 린넨 패브릭으로 마감했으며, 이탈리아 브랜드 어메니티와 커피 머신이 준비되어 있습니다.",
      },
      en: {
        name: "Deluxe Ocean",
        tagline: "A room filled with the West Sea sunset",
        description:
          "Our signature 38㎡ room with a king bed and floor-to-ceiling windows. Every Deluxe Ocean faces west, so the sunset happens inside your room.\n\nFinished in natural wood and linen, with Italian amenities and an espresso machine.",
      },
      ja: {
        name: "デラックスオーシャン",
        tagline: "西海の夕日が窓いっぱいに広がる客室",
        description:
          "38㎡のゆとりある空間にキングベッドと全面ガラス窓を備えた代表的な客室です。すべてのデラックスオーシャンは西向きで、客室から夕日をお楽しみいただけます。\n\n天然木とリネンで仕上げ、イタリアブランドのアメニティとコーヒーマシンをご用意しています。",
      },
    },
    images: [
      { url: img("photo-1611892440504-42a792e24d32") },
      { url: img("photo-1590490360182-c33d57733427") },
    ],
    amenities: ["wifi", "oceanview", "espresso", "bathtub", "minibar"],
    sizeSqm: 38,
    occupancyBase: 2,
    occupancyMax: 3,
    totalRooms: 12,
    status: "active",
  },
  {
    id: "22111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    slug: "premier-terrace",
    code: "PRM-T",
    sort: 20,
    content: {
      ko: {
        name: "프리미어 테라스",
        tagline: "프라이빗 테라스에서 즐기는 바다",
        description:
          "45㎡ 객실에 12㎡의 프라이빗 테라스가 더해진 타입입니다. 테라스의 데이베드에 누워 파도 소리를 들으며 하루를 마무리해 보세요.\n\n야외 샤워 부스와 웰컴 스파클링 와인이 제공됩니다.",
      },
      en: {
        name: "Premier Terrace",
        tagline: "The sea from your private terrace",
        description:
          "A 45㎡ room extended by a 12㎡ private terrace. End the day on the terrace daybed listening to the waves.\n\nIncludes an outdoor shower booth and welcome sparkling wine.",
      },
      ja: {
        name: "プレミアテラス",
        tagline: "プライベートテラスで楽しむ海",
        description:
          "45㎡の客室に12㎡のプライベートテラスが付いたタイプです。テラスのデイベッドで波の音を聞きながら一日を締めくくってください。\n\n屋外シャワーブースとウェルカムスパークリングワインをご用意しています。",
      },
    },
    images: [
      { url: img("photo-1582719478250-c89cae4dc85b") },
      { url: img("photo-1584132967334-10e028bd69f7") },
    ],
    amenities: ["wifi", "terrace", "oceanview", "espresso", "bathtub"],
    sizeSqm: 45,
    occupancyBase: 2,
    occupancyMax: 3,
    totalRooms: 8,
    status: "active",
  },
  {
    id: "23111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    slug: "family-suite",
    code: "FAM-S",
    sort: 30,
    content: {
      ko: {
        name: "패밀리 스위트",
        tagline: "침실 두 개, 온 가족의 바다",
        description:
          "62㎡ 투룸 스위트로, 킹 베드룸과 트윈 베드룸이 분리되어 있어 3대가 함께하는 여행에도 여유롭습니다.\n\n키즈 어메니티와 유아 침대, 미니 주방이 준비되어 있습니다.",
      },
      en: {
        name: "Family Suite",
        tagline: "Two bedrooms, the sea for the whole family",
        description:
          "A 62㎡ two-room suite with a separate king bedroom and twin bedroom — comfortable even for three generations traveling together.\n\nKids' amenities, a crib and a kitchenette are provided.",
      },
      ja: {
        name: "ファミリースイート",
        tagline: "ベッドルーム2つ、家族みんなの海",
        description:
          "62㎡のツールームスイートで、キングベッドルームとツインベッドルームが分かれており、三世代旅行にもゆとりがあります。\n\nキッズアメニティ、ベビーベッド、ミニキッチンをご用意しています。",
      },
    },
    images: [
      { url: img("photo-1591088398332-8a7791972843") },
      { url: img("photo-1566665797739-1674de7a421a") },
    ],
    amenities: ["wifi", "kitchenette", "oceanview", "kids", "bathtub"],
    sizeSqm: 62,
    occupancyBase: 4,
    occupancyMax: 5,
    totalRooms: 6,
    status: "active",
  },
  {
    id: "24111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    slug: "presidential-suite",
    code: "PRS-S",
    sort: 40,
    content: {
      ko: {
        name: "프레지덴셜 스위트",
        tagline: "최상층 전체를 하나의 객실로",
        description:
          "120㎡의 최상층 스위트입니다. 전용 다이닝 룸, 프라이빗 자쿠지, 버틀러 서비스가 포함되며 단 하루 한 팀만 모십니다.\n\n체크인부터 체크아웃까지 전 일정 버틀러가 함께합니다.",
      },
      en: {
        name: "Presidential Suite",
        tagline: "The entire top floor, one suite",
        description:
          "A 120㎡ top-floor suite with a private dining room, jacuzzi and butler service — one party per night, no exceptions.\n\nA dedicated butler accompanies your entire stay.",
      },
      ja: {
        name: "プレジデンシャルスイート",
        tagline: "最上階すべてをひとつの客室に",
        description:
          "120㎡の最上階スイートです。専用ダイニングルーム、プライベートジャグジー、バトラーサービスが含まれ、一晩一組限定です。\n\nチェックインからチェックアウトまで専属バトラーがご一緒します。",
      },
    },
    images: [
      { url: img("photo-1578683010236-d716f9a3f461") },
      { url: img("photo-1595576508898-0ad5c879a061") },
    ],
    amenities: ["wifi", "jacuzzi", "butler", "oceanview", "dining"],
    sizeSqm: 120,
    occupancyBase: 2,
    occupancyMax: 4,
    totalRooms: 1,
    status: "active",
  },
];

export const DEMO_RATE_PLANS: RatePlan[] = DEMO_ROOM_TYPES.flatMap(
  (room, i): RatePlan[] => {
    const base = [280_000, 380_000, 520_000, 1_800_000][i];
    return [
      {
        id: `3${i + 1}111111-1111-4111-8111-111111111111`,
        hotelId: DEMO_HOTEL.id,
        roomTypeId: room.id,
        code: `${room.code}-BAR`,
        name: { ko: "룸 온리", en: "Room Only", ja: "室料のみ" },
        mealPlan: "room_only",
        cancellationPolicy: {
          freeUntilDaysBefore: 3,
          penaltyPercent: 100,
          text: {
            ko: "체크인 3일 전까지 무료 취소",
            en: "Free cancellation until 3 days before check-in",
            ja: "チェックイン3日前まで無料キャンセル",
          },
        },
        basePrice: base,
        status: "active",
      },
      {
        id: `4${i + 1}111111-1111-4111-8111-111111111111`,
        hotelId: DEMO_HOTEL.id,
        roomTypeId: room.id,
        code: `${room.code}-BB`,
        name: {
          ko: "조식 포함",
          en: "Breakfast Included",
          ja: "朝食付き",
        },
        mealPlan: "breakfast",
        cancellationPolicy: {
          freeUntilDaysBefore: 3,
          penaltyPercent: 100,
          text: {
            ko: "체크인 3일 전까지 무료 취소",
            en: "Free cancellation until 3 days before check-in",
            ja: "チェックイン3日前まで無料キャンセル",
          },
        },
        basePrice: base + 60_000,
        status: "active",
      },
    ];
  },
);

export const DEMO_PAGES: PageDef[] = [
  {
    id: "51111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    path: "/",
    kind: "home",
    status: "published",
    seo: {
      ko: { title: "오로라 베이 호텔 & 스파" },
      en: { title: "Aurora Bay Hotel & Spa" },
      ja: { title: "オーロラベイ ホテル＆スパ" },
    },
    sections: [
      {
        id: "home-hero",
        type: "hero",
        version: 1,
        props: {
          image: img("photo-1571896349842-33c89424de2d", 2400),
          eyebrow: {
            ko: "OCEANFRONT · PYEONGTAEK",
            en: "OCEANFRONT · PYEONGTAEK",
            ja: "OCEANFRONT · PYEONGTAEK",
          },
          heading: {
            ko: "서해의 빛을 담은\n조용한 휴식",
            en: "Quiet luxury,\nlit by the West Sea",
            ja: "西海の光をたたえた\n静かな休息",
          },
          subheading: {
            ko: "전 객실 오션뷰 · 인피니티 풀 · 시그니처 스파",
            en: "All-ocean-view rooms · Infinity pool · Signature spa",
            ja: "全室オーシャンビュー・インフィニティプール・シグネチャースパ",
          },
          cta: {
            label: { ko: "객실 둘러보기", en: "Explore Rooms", ja: "客室を見る" },
            href: "/rooms",
          },
          showBookingBar: true,
        },
      },
      {
        id: "home-quote",
        type: "quote-banner",
        version: 1,
        props: {
          eyebrow: { ko: "WELCOME", en: "WELCOME", ja: "WELCOME" },
          quote: {
            ko: "바다가 하루의 속도를 늦추는 곳, 오로라 베이에서 가장 느린 휴가를 보내세요.",
            en: "Where the sea slows the day down — take your slowest holiday yet at Aurora Bay.",
            ja: "海が一日の速度を緩める場所。オーロラベイで最もゆっくりとした休暇を。",
          },
        },
      },
      {
        id: "home-rooms",
        type: "rooms-showcase",
        version: 1,
        props: {
          heading: { ko: "객실", en: "Rooms & Suites", ja: "客室" },
          subheading: {
            ko: "모든 객실이 바다를 향해 열려 있습니다",
            en: "Every room opens to the sea",
            ja: "すべての客室が海に向かって開かれています",
          },
          limit: 4,
        },
      },
      {
        id: "home-amenities",
        type: "amenities",
        version: 1,
        props: {
          heading: { ko: "부대시설", en: "Facilities", ja: "施設" },
          items: [
            {
              icon: "pool",
              title: { ko: "인피니티 풀", en: "Infinity Pool", ja: "インフィニティプール" },
              description: {
                ko: "수평선과 이어지는 25m 야외 온수 풀",
                en: "A 25m heated outdoor pool that meets the horizon",
                ja: "水平線とつながる25mの屋外温水プール",
              },
            },
            {
              icon: "spa",
              title: { ko: "시그니처 스파", en: "Signature Spa", ja: "シグネチャースパ" },
              description: {
                ko: "서해 해수를 활용한 탈라소 테라피",
                en: "Thalassotherapy with West Sea waters",
                ja: "西海の海水を活かしたタラソテラピー",
              },
            },
            {
              icon: "gym",
              title: { ko: "피트니스", en: "Fitness", ja: "フィットネス" },
              description: {
                ko: "바다를 보며 운동하는 24시간 짐",
                en: "A 24-hour gym facing the sea",
                ja: "海を眺めながら運動できる24時間ジム",
              },
            },
            {
              icon: "kids",
              title: { ko: "키즈 라운지", en: "Kids Lounge", ja: "キッズラウンジ" },
              description: {
                ko: "보호자와 함께하는 실내 플레이 라운지",
                en: "An indoor play lounge for families",
                ja: "ご家族で楽しめる屋内プレイラウンジ",
              },
            },
          ],
        },
      },
      {
        id: "home-gallery",
        type: "gallery",
        version: 1,
        props: {
          heading: { ko: "갤러리", en: "Gallery", ja: "ギャラリー" },
          images: [
            { url: img("photo-1566073771259-6a8506099945", 1200) },
            { url: img("photo-1520250497591-112f2f40a3f4", 1200) },
            { url: img("photo-1544161515-4ab6ce6db874", 1200) },
            { url: img("photo-1551882547-ff40c63fe5fa", 1200) },
            { url: img("photo-1445019980597-93fa8acb246c", 1200) },
            { url: img("photo-1540541338287-41700207dee6", 1200) },
          ],
        },
      },
      {
        id: "home-dining",
        type: "dining",
        version: 1,
        props: {
          heading: { ko: "다이닝", en: "Dining", ja: "ダイニング" },
          venues: [
            {
              name: { ko: "물마루", en: "Mulmaru", ja: "ムルマル" },
              description: {
                ko: "서해 제철 해산물로 차리는 파인 다이닝. 저녁 코스는 예약제로 운영됩니다.",
                en: "Fine dining built on the West Sea's seasonal catch. Dinner is by reservation.",
                ja: "西海の旬の海の幸によるファインダイニング。ディナーは予約制です。",
              },
              image: img("photo-1414235077428-338989a2e8c0", 1200),
              hours: "12:00–15:00 / 18:00–22:00",
            },
            {
              name: { ko: "베이 라운지", en: "Bay Lounge", ja: "ベイラウンジ" },
              description: {
                ko: "일몰 시간에 맞춘 칵테일과 내추럴 와인 셀렉션.",
                en: "Cocktails timed to sunset and a natural wine list.",
                ja: "夕日に合わせたカクテルとナチュラルワインのセレクション。",
              },
              image: img("photo-1470337458703-46ad1756a187", 1200),
              hours: "17:00–01:00",
            },
          ],
        },
      },
      {
        id: "home-location",
        type: "location",
        version: 1,
        props: {
          heading: { ko: "오시는 길", en: "Getting Here", ja: "アクセス" },
          description: {
            ko: "서울에서 차로 70분, 평택지제역(SRT)에서 30분. 발레파킹과 전기차 충전소를 운영합니다.",
            en: "70 minutes by car from Seoul, 30 minutes from Pyeongtaek-Jije SRT station. Valet parking and EV chargers available.",
            ja: "ソウルから車で70分、平沢芝制駅(SRT)から30分。バレーパーキングとEV充電器がございます。",
          },
          showContact: true,
        },
      },
      {
        id: "home-cta",
        type: "cta-banner",
        version: 1,
        props: {
          image: img("photo-1507525428034-b723cf961d3e", 2000),
          heading: {
            ko: "공식 홈페이지 최저가 보장",
            en: "Best rate, only when you book direct",
            ja: "公式サイト限定ベストレート保証",
          },
          subheading: {
            ko: "직접 예약 고객에게 얼리 체크인과 레이트 체크아웃을 우선 제공합니다.",
            en: "Direct bookers get priority early check-in and late check-out.",
            ja: "直接ご予約のお客様にアーリーチェックイン・レイトチェックアウトを優先提供します。",
          },
          cta: {
            label: { ko: "지금 예약하기", en: "Book Now", ja: "今すぐ予約" },
            href: "/booking",
          },
        },
      },
    ],
  },
  {
    id: "52111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    path: "/about",
    kind: "custom",
    status: "published",
    seo: {
      ko: {
        title: "호텔 소개",
        description: "오로라 베이가 바다를 대하는 방식에 대하여.",
      },
      en: {
        title: "About",
        description: "How Aurora Bay lives with the sea.",
      },
      ja: { title: "ホテルについて" },
    },
    sections: [
      {
        id: "about-text",
        type: "rich-text",
        version: 1,
        props: {
          heading: { ko: "호텔 소개", en: "About Aurora Bay", ja: "ホテルについて" },
          body: {
            ko: "오로라 베이는 서해의 리듬 위에 지어졌습니다. 밀물과 썰물, 해가 지는 각도, 계절마다 달라지는 바람. 우리는 그 리듬을 거스르지 않는 휴식을 설계합니다.\n\n86개의 객실은 모두 바다를 향해 있으며, 다이닝은 그날 아침 포구에 들어온 것들로 차립니다. 스파는 서해 해수를 데워 사용합니다.\n\n호텔이 할 일은 완벽한 하루를 만드는 것이 아니라, 완벽하게 아무것도 하지 않아도 되는 하루를 만드는 것이라 믿습니다.",
            en: "Aurora Bay is built on the rhythm of the West Sea — the tides, the angle of the setting sun, the wind that changes with the seasons. We design rest that doesn't fight that rhythm.\n\nAll 86 rooms face the sea. The kitchens cook what came into the harbor that morning. The spa warms actual West Sea water.\n\nWe believe a hotel's job is not to build a perfect day, but a day where doing nothing is perfectly enough.",
            ja: "オーロラベイは西海のリズムの上に建てられました。潮の満ち引き、夕日の角度、季節ごとに変わる風。私たちはそのリズムに逆らわない休息を設計します。\n\n86の客室はすべて海に面しており、ダイニングはその朝、港に届いたもので調えます。スパは西海の海水を温めて使用します。\n\nホテルの仕事は完璧な一日をつくることではなく、完璧に何もしなくてもよい一日をつくることだと信じています。",
          },
        },
      },
      {
        id: "about-gallery",
        type: "gallery",
        version: 1,
        props: {
          images: [
            { url: img("photo-1571003123894-1f0594d2b5d9", 1200) },
            { url: img("photo-1584622650111-993a426fbf0a", 1200) },
            { url: img("photo-1560448204-e02f11c3d0e2", 1200) },
          ],
        },
      },
      {
        id: "about-faq",
        type: "faq",
        version: 1,
        props: {
          heading: { ko: "자주 묻는 질문", en: "FAQ", ja: "よくあるご質問" },
          items: [
            {
              question: {
                ko: "체크인/체크아웃 시간은 어떻게 되나요?",
                en: "What are the check-in and check-out times?",
                ja: "チェックイン・チェックアウトの時間は？",
              },
              answer: {
                ko: "체크인은 오후 3시, 체크아웃은 오전 11시입니다. 직접 예약 고객은 가능 시 얼리 체크인을 우선 안내해 드립니다.",
                en: "Check-in is 3:00 PM and check-out is 11:00 AM. Direct bookers get priority early check-in when available.",
                ja: "チェックインは15時、チェックアウトは11時です。直接ご予約のお客様には空き状況によりアーリーチェックインをご案内します。",
              },
            },
            {
              question: {
                ko: "반려동물 동반이 가능한가요?",
                en: "Are pets allowed?",
                ja: "ペットの同伴は可能ですか？",
              },
              answer: {
                ko: "현재는 안내견 외 반려동물 동반이 어렵습니다.",
                en: "Currently only service animals are permitted.",
                ja: "現在、補助犬を除きペットの同伴はご遠慮いただいております。",
              },
            },
            {
              question: {
                ko: "주차는 무료인가요?",
                en: "Is parking free?",
                ja: "駐車場は無料ですか？",
              },
              answer: {
                ko: "투숙객에게 발레파킹을 포함한 주차가 무료로 제공됩니다.",
                en: "Parking, including valet, is complimentary for hotel guests.",
                ja: "ご宿泊のお客様はバレーパーキングを含め無料でご利用いただけます。",
              },
            },
          ],
        },
      },
      {
        id: "about-cta",
        type: "cta-banner",
        version: 1,
        props: {
          heading: {
            ko: "바다는 준비되어 있습니다",
            en: "The sea is ready when you are",
            ja: "海はいつでも待っています",
          },
          cta: {
            label: { ko: "예약하기", en: "Book Now", ja: "予約する" },
            href: "/booking",
          },
        },
      },
    ],
  },
];

export const DEMO_POSTS: PostDef[] = [
  {
    id: "61111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    slug: "summer-escape-2026",
    kind: "promo",
    title: {
      ko: "여름 얼리버드 — 2박 이상 20% 할인",
      en: "Summer Early Bird — 20% off stays of 2+ nights",
      ja: "サマーアーリーバード — 2泊以上20%オフ",
    },
    excerpt: {
      ko: "7월 한 달간, 공식 홈페이지에서만. 인피니티 풀과 함께하는 여름을 가장 좋은 조건으로.",
      en: "July only, direct bookings only — the best summer by the infinity pool.",
      ja: "7月限定、公式サイトのみ。インフィニティプールで過ごす夏を最高の条件で。",
    },
    coverImage:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1600&auto=format&fit=crop",
    bodySections: [
      {
        id: "post-summer-body",
        type: "rich-text",
        version: 1,
        props: {
          body: {
            ko: "올여름, 오로라 베이의 인피니티 풀이 다시 열립니다.\n\n7월 한 달간 공식 홈페이지에서 2박 이상 예약하시면 전 객실 20% 할인을 드립니다. 조식 패키지 선택 시 키즈 라운지 이용권이 함께 제공됩니다.\n\n객실 수가 한정되어 있어 조기 마감될 수 있습니다.",
            en: "This summer, the infinity pool at Aurora Bay opens again.\n\nBook 2+ nights on our official website during July and enjoy 20% off all rooms. Breakfast packages include kids lounge passes.\n\nAvailability is limited.",
            ja: "この夏、オーロラベイのインフィニティプールが再びオープンします。\n\n7月中に公式サイトで2泊以上ご予約いただくと、全客室20%オフ。朝食パッケージにはキッズラウンジ利用券が付きます。\n\n客室数には限りがございます。",
          },
        },
      },
      {
        id: "post-summer-cta",
        type: "cta-banner",
        version: 1,
        props: {
          heading: { ko: "여름을 예약하세요", en: "Book your summer", ja: "夏を予約する" },
          cta: { label: { ko: "지금 예약", en: "Book Now", ja: "今すぐ予約" }, href: "/booking" },
        },
      },
    ],
    status: "published",
    publishedAt: "2026-06-20T09:00:00Z",
  },
  {
    id: "62111111-1111-4111-8111-111111111111",
    hotelId: DEMO_HOTEL.id,
    slug: "pyeongtaek-day-trip",
    kind: "local_guide",
    title: {
      ko: "호텔에서 30분, 평택 당일 코스 4곳",
      en: "Four day-trip spots within 30 minutes of the hotel",
      ja: "ホテルから30分、平沢日帰りコース4選",
    },
    excerpt: {
      ko: "체크인 전, 체크아웃 후에 들르기 좋은 곳들을 컨시어지가 직접 골랐습니다.",
      en: "Hand-picked by our concierge for before check-in and after check-out.",
      ja: "チェックイン前後に立ち寄りたい場所をコンシェルジュが厳選しました。",
    },
    coverImage:
      "https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=1600&auto=format&fit=crop",
    bodySections: [
      {
        id: "post-trip-body",
        type: "rich-text",
        version: 1,
        props: {
          body: {
            ko: "여행의 절반은 숙소 밖에서 일어납니다. 호텔에서 차로 30분 안에 닿는 네 곳을 소개합니다.\n\n첫째, 평택호 관광단지 — 해질 무렵 호수 산책로가 특히 아름답습니다. 둘째, 소풍정원 — 아이와 함께라면 오전 시간을 추천합니다. 셋째, 평택항 마린센터 전망대 — 서해를 한눈에. 넷째, 재래시장 통복시장 — 체크아웃 후 장보기 코스로 좋습니다.\n\n컨시어지 데스크에서 상세 지도와 함께 안내해 드립니다.",
            en: "Half of every trip happens outside the room. Here are four spots within a 30-minute drive.\n\nPyeongtaek Lake Park for sunset walks, Sopung Garden for mornings with kids, the Marine Center observatory for a view over the West Sea, and Tongbok traditional market for post-checkout shopping.\n\nOur concierge desk has detailed maps.",
            ja: "旅の半分は宿の外で起こります。車で30分以内の4か所をご紹介します。\n\n夕暮れの平沢湖散策路、子供連れに嬉しいソプン庭園、西海を一望するマリンセンター展望台、チェックアウト後の買い物に良い通福市場。\n\nコンシェルジュデスクで詳しい地図をご用意しています。",
          },
        },
      },
    ],
    status: "published",
    publishedAt: "2026-07-05T09:00:00Z",
  },
];
