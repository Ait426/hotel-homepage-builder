"use client";

import { useState } from "react";

type Phase = "idle" | "auditing" | "audited" | "working" | "done" | "error";
type Path = "url" | "manual";

interface AuditAxis {
  key: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

interface Audit {
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  verdict: string;
  axes: AuditAxis[];
}

interface Result {
  hotelName: string;
  previewUrl: string;
  mode: "ai" | "heuristic";
  audit: Audit | null;
  imagesFound: number;
  usedStockImages: boolean;
  redirectsCreated: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_url: "주소 형식을 확인해 주세요. (예: myhotel.co.kr)",
  fetch_failed: "사이트를 불러오지 못했습니다. 주소가 맞는지 확인해 주세요.",
  site_blocked:
    "이 사이트는 자동 접근이 차단되어 있습니다. '처음 만들어요' 탭에서 직접 입력으로 시작해 보세요.",
  unreadable:
    "이 사이트는 자동으로 읽을 수 없는 구조입니다 (봇 차단 또는 빈 페이지). '처음 만들어요' 탭에서 직접 입력으로 시작해 보세요.",
  invalid_input: "입력 내용을 확인해 주세요.",
  persist_failed: "저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

const PROPERTY_TYPES = [
  { value: "hotel", label: "호텔" },
  { value: "motel", label: "모텔" },
  { value: "resort", label: "리조트" },
  { value: "pension", label: "펜션·풀빌라" },
  { value: "guesthouse", label: "게스트하우스" },
] as const;

const inputCls =
  "w-full rounded-token border border-brand-ink/20 bg-surface px-5 py-4 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-accent";

function gradeColor(grade: Audit["grade"]): string {
  if (grade === "A" || grade === "B") return "text-emerald-600";
  if (grade === "C") return "text-amber-600";
  return "text-red-600";
}

function barColor(score: number, max: number): string {
  const ratio = score / max;
  if (ratio >= 0.99) return "bg-emerald-500";
  if (ratio >= 0.5) return "bg-amber-500";
  return "bg-red-400";
}

/** 진단 점수표 — 좋으면 좋다고 말해주는 화면 */
function Scorecard({ audit, siteTitle }: { audit: Audit; siteTitle: string | null }) {
  return (
    <div className="rounded-token bg-surface p-6 text-left shadow-xl sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
            홈페이지 진단 결과
          </p>
          {siteTitle ? <h2 className="mt-1 font-display text-xl text-ink">{siteTitle}</h2> : null}
        </div>
        <p className={`font-display text-5xl leading-none ${gradeColor(audit.grade)}`}>
          {audit.total}
          <span className="ml-1 align-top text-base text-ink-muted">/100</span>
        </p>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink">{audit.verdict}</p>

      <ul className="mt-5 space-y-3">
        {audit.axes.map((axis) => (
          <li key={axis.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink">{axis.label}</span>
              <span className="text-xs tabular-nums text-ink-muted">
                {axis.score}/{axis.max}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div
                className={`h-full rounded-full ${barColor(axis.score, axis.max)}`}
                style={{ width: `${Math.max(4, (axis.score / axis.max) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{axis.note}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StartForm() {
  const [path, setPath] = useState<Path>("url");
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [siteTitle, setSiteTitle] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setPhase("idle");
    setError(null);
    setAudit(null);
    setSiteTitle(null);
    setResult(null);
    setUrl("");
  }

  async function callApi(endpoint: string, body: unknown): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(ERROR_MESSAGES[json.error] ?? "잠시 후 다시 시도해 주세요.");
        setPhase("error");
        return null;
      }
      return json;
    } catch {
      setError("잠시 후 다시 시도해 주세요.");
      setPhase("error");
      return null;
    }
  }

  /** step 1 (url path): 진단 — nothing is generated yet */
  async function submitAudit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "auditing" || phase === "working") return;
    setPhase("auditing");
    setError(null);
    const json = await callApi("/api/audit", { url });
    if (!json) return;
    setAudit(json.audit as Audit);
    setSiteTitle((json.siteTitle as string | null) ?? null);
    setPhase("audited");
  }

  /** step 2: 생성 — the owner decided the score warrants it */
  async function generate(body: unknown) {
    if (phase === "working") return;
    setPhase("working");
    setError(null);
    const json = await callApi("/api/onboarding", body);
    if (!json) return;
    setResult(json as unknown as Result);
    setPhase("done");
  }

  function submitManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void generate({
      manual: {
        name: f.get("name"),
        propertyType: f.get("propertyType"),
        intro: f.get("intro") || undefined,
        phone: f.get("phone") || undefined,
        address: f.get("address") || undefined,
      },
    });
  }

  if (phase === "done" && result) {
    return (
      <div className="rounded-token bg-surface p-8 text-left shadow-xl">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
          완성되었습니다
        </p>
        <h2 className="mt-2 font-display text-2xl text-ink">{result.hotelName}</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {result.audit ? `기존 홈페이지 진단 ${result.audit.total}점에서 출발했습니다. ` : ""}
          {result.usedStockImages
            ? "임시 이미지로 구성했습니다 — 검수 단계에서 실제 사진으로 교체해 주세요."
            : `기존 사이트에서 사진 ${result.imagesFound}장과 정보를 가져와 구성했습니다.`}
          {result.redirectsCreated > 0
            ? ` 기존 페이지 주소 ${result.redirectsCreated}개는 새 주소로 자동 연결(301)되어 검색 순위가 유지됩니다.`
            : ""}
          {result.mode === "heuristic"
            ? " (AI 카피라이팅은 API 키 연결 시 활성화됩니다.)"
            : ""}
        </p>
        <a
          href={result.previewUrl}
          className="mt-6 block bg-brand px-6 py-4 text-center text-sm font-medium tracking-widest text-brand-ink transition-opacity hover:opacity-90"
        >
          새 홈페이지 보러 가기 →
        </a>
        <button
          type="button"
          onClick={reset}
          className="mt-3 w-full cursor-pointer py-2 text-center text-xs text-ink-muted hover:text-ink"
        >
          다른 숙소 만들기
        </button>
      </div>
    );
  }

  // 진단 결과 화면: 점수를 보고 나서 만들지 말지 사장님이 결정한다
  if ((phase === "audited" || phase === "working") && audit) {
    const goodEnough = audit.total >= 80;
    return (
      <div className="text-left">
        <Scorecard audit={audit} siteTitle={siteTitle} />
        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            disabled={phase === "working"}
            onClick={() => void generate({ url })}
            className={`cursor-pointer rounded-token px-8 py-4 text-sm font-medium tracking-widest transition-opacity hover:opacity-90 disabled:opacity-60 ${
              goodEnough
                ? "border border-brand-ink/30 text-brand-ink"
                : "bg-accent text-brand"
            }`}
          >
            {phase === "working"
              ? "새 홈페이지를 짓는 중… (10~30초)"
              : goodEnough
                ? "그래도 새 시안을 한번 볼래요 (무료)"
                : "새 홈페이지 시안 만들기 (무료)"}
          </button>
          <button
            type="button"
            disabled={phase === "working"}
            onClick={reset}
            className="cursor-pointer py-1 text-center text-xs text-brand-ink/60 hover:text-brand-ink"
          >
            다른 주소 진단하기
          </button>
        </div>
        {error ? <p className="mt-4 text-center text-sm text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="text-left">
      {/* path switch */}
      <div className="mb-5 flex justify-center gap-2">
        {(
          [
            { key: "url", label: "기존 홈페이지가 있어요" },
            { key: "manual", label: "처음 만들어요" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setPath(tab.key);
              setError(null);
              setPhase("idle");
            }}
            className={`cursor-pointer rounded-full px-5 py-2 text-xs font-medium tracking-wide transition-colors ${
              path === tab.key
                ? "bg-accent text-brand"
                : "bg-brand-ink/10 text-brand-ink/70 hover:text-brand-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {path === "url" ? (
        <form onSubmit={submitAudit}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="기존 홈페이지 주소 (예: myhotel.co.kr)"
              required
              disabled={phase === "auditing"}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={phase === "auditing"}
              className="cursor-pointer whitespace-nowrap rounded-token bg-accent px-8 py-4 text-sm font-medium tracking-widest text-brand transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {phase === "auditing" ? "진단 중…" : "무료 진단받기"}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-brand-ink/60">
            먼저 지금 홈페이지의 점수를 보여드립니다 — 충분히 좋다면 좋다고 말씀드려요.
          </p>
        </form>
      ) : (
        <form onSubmit={submitManual} className="space-y-3 rounded-token bg-surface/10 p-1">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <input name="name" required maxLength={60} placeholder="숙소 이름 (예: 바다뷰 펜션)" className={inputCls} />
            <select name="propertyType" required defaultValue="pension" className={inputCls}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <input name="intro" maxLength={500} placeholder="한 줄 소개 (예: 통창으로 바다가 보이는 독채 풀빌라)" className={inputCls} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="phone" maxLength={30} placeholder="전화번호 (선택)" className={inputCls} />
            <input name="address" maxLength={120} placeholder="주소 (선택)" className={inputCls} />
          </div>
          <button
            type="submit"
            disabled={phase === "working"}
            className="w-full cursor-pointer rounded-token bg-accent px-8 py-4 text-sm font-medium tracking-widest text-brand transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {phase === "working" ? "만드는 중…" : "무료로 만들기"}
          </button>
        </form>
      )}

      {phase === "auditing" ? (
        <p className="mt-4 animate-pulse text-center text-sm text-brand-ink/70">
          기존 사이트를 읽고 진단하는 중입니다… (5~20초)
        </p>
      ) : null}
      {phase === "working" && path === "manual" ? (
        <p className="mt-4 animate-pulse text-center text-sm text-brand-ink/70">
          새 홈페이지를 짓는 중입니다… (10~30초)
        </p>
      ) : null}
      {error ? <p className="mt-4 text-center text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
