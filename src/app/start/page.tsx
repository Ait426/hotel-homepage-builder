import type { Metadata } from "next";
import { StartForm } from "./StartForm";

export const metadata: Metadata = {
  title: "1분 만에 다시 태어나는 호텔 홈페이지",
  robots: { index: false },
};

/**
 * The onboarding wizard's front door — the product's mission in one screen:
 * paste the old site's URL, watch it come back as a luxury-grade site.
 */
export default function StartPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-accent">
          Hotel Homepage Upgrade
        </p>
        <h1 className="mt-5 font-display text-3xl leading-snug text-brand-ink sm:text-5xl">
          주소 하나면,
          <br />
          특급호텔급 홈페이지가 완성됩니다
        </h1>
        <p className="mx-auto mt-6 max-w-md text-sm leading-6 text-brand-ink/70">
          호텔·모텔·리조트·펜션·게스트하우스 — 기존 사이트를 업그레이드하거나,
          처음부터 새로 만들어 드립니다. 다국어·예약 기능 포함, 무료입니다.
        </p>

        <div className="mt-10">
          <StartForm />
        </div>

        <p className="mt-8 text-xs text-brand-ink/50">
          생성된 미리보기는 데모 환경에서 서버 재시작 시 초기화됩니다.
        </p>
      </div>
    </main>
  );
}
