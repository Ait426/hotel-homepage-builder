import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "콘솔 — 숙소 관리",
  robots: { index: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-ink/10 bg-brand">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/admin" className="font-display text-lg text-brand-ink">
            숙소 콘솔
          </Link>
          <Link
            href="/start"
            className="rounded-token bg-accent px-4 py-2 text-xs font-medium tracking-wide text-brand"
          >
            + 새 숙소 만들기
          </Link>
        </div>
      </header>

      {isDemoMode() ? (
        <p className="border-b border-accent/30 bg-accent/10 px-5 py-2 text-center text-xs text-ink-muted">
          데모 콘솔 — 데이터는 서버 재시작 시 초기화됩니다. 운영 배포에서는 로그인이 적용됩니다.
        </p>
      ) : null}

      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">{children}</main>
    </div>
  );
}
