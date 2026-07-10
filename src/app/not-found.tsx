/**
 * Platform-level 404 — reached for unknown tenant domains (or unknown paths
 * before tenant resolution). Intentionally unbranded and locale-neutral.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-ink-muted">
        404
      </p>
      <h1 className="font-display text-2xl text-ink">
        페이지를 찾을 수 없습니다 · Page not found
      </h1>
      <p className="max-w-md text-sm text-ink-muted">
        요청하신 주소가 존재하지 않거나, 이 도메인이 아직 연결되지 않았습니다.
        <br />
        The address does not exist, or this domain is not connected yet.
      </p>
    </main>
  );
}
