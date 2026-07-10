"use client";

import { useState } from "react";

type Phase = "idle" | "working" | "done" | "error";

interface Result {
  hotelName: string;
  previewUrl: string;
  mode: "ai" | "heuristic";
  imagesFound: number;
  redirectsCreated: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_url: "주소 형식을 확인해 주세요. (예: myhotel.co.kr)",
  fetch_failed: "사이트를 불러오지 못했습니다. 주소가 맞는지 확인해 주세요.",
  site_blocked:
    "이 사이트는 자동 접근이 차단되어 있습니다. 사진과 정보를 직접 입력하는 방식으로 도와드릴게요.",
  invalid_input: "주소를 입력해 주세요.",
  persistent_onboarding_not_yet_supported:
    "이 환경에서는 아직 지원되지 않는 기능입니다.",
};

export function StartForm() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "working") return;
    setPhase("working");
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(ERROR_MESSAGES[json.error] ?? "잠시 후 다시 시도해 주세요.");
        setPhase("error");
        return;
      }
      setResult(json);
      setPhase("done");
    } catch {
      setError("잠시 후 다시 시도해 주세요.");
      setPhase("error");
    }
  }

  if (phase === "done" && result) {
    return (
      <div className="rounded-token bg-surface p-8 text-left shadow-xl">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
          완성되었습니다
        </p>
        <h2 className="mt-2 font-display text-2xl text-ink">{result.hotelName}</h2>
        <p className="mt-2 text-sm text-ink-muted">
          기존 사이트에서 사진 {result.imagesFound}장과 호텔 정보를 가져와
          새 홈페이지를 구성했습니다.
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
          onClick={() => {
            setPhase("idle");
            setResult(null);
            setUrl("");
          }}
          className="mt-3 w-full cursor-pointer py-2 text-center text-xs text-ink-muted hover:text-ink"
        >
          다른 주소로 다시 만들기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="text-left">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="기존 홈페이지 주소 (예: myhotel.co.kr)"
          required
          disabled={phase === "working"}
          className="w-full rounded-token border border-brand-ink/20 bg-surface px-5 py-4 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-accent"
        />
        <button
          type="submit"
          disabled={phase === "working"}
          className="cursor-pointer whitespace-nowrap rounded-token bg-accent px-8 py-4 text-sm font-medium tracking-widest text-brand transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {phase === "working" ? "만드는 중…" : "무료로 만들기"}
        </button>
      </div>

      {phase === "working" ? (
        <p className="mt-4 animate-pulse text-center text-sm text-brand-ink/70">
          기존 사이트를 읽고 새 홈페이지를 짓는 중입니다… (10~30초)
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-center text-sm text-red-300">{error}</p>
      ) : null}
    </form>
  );
}
