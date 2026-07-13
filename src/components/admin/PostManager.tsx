"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface PostRow {
  id: string;
  slug: string;
  kind: string;
  title: string;
  status: string;
  publishedAt?: string;
}

const KIND_LABELS: Record<string, string> = {
  notice: "공지",
  promo: "프로모션",
  article: "매거진",
};

/** AI 글 생성 + 초안 발행 */
export function PostManager({
  hotelSlug,
  defaultLocale,
  posts,
}: {
  hotelSlug: string;
  defaultLocale: string;
  posts: PostRow[];
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState("article");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    setWorking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, kind, hotelSlug }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error();
      setMessage(
        json.status === "draft"
          ? "초안이 생성되었습니다 — 검토 후 발행하세요."
          : "글이 생성되어 사이트에 게시되었습니다.",
      );
      setTopic("");
      router.refresh();
    } catch {
      setMessage("생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setWorking(false);
    }
  }

  async function publish(postId: string) {
    const res = await fetch("/api/admin/posts/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotelSlug, postId }),
    });
    const json = await res.json();
    if (json.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={generate}
        className="flex flex-col gap-3 rounded-token bg-surface p-5 shadow-sm ring-1 ring-ink/5 sm:flex-row"
      >
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-token border border-ink/15 bg-canvas px-3 py-2.5 text-sm text-ink outline-none"
        >
          <option value="article">매거진</option>
          <option value="promo">프로모션</option>
          <option value="notice">공지</option>
        </select>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          required
          minLength={2}
          maxLength={300}
          placeholder="글 주제 (예: 겨울 온수풀 시즌 오픈 안내)"
          className="flex-1 rounded-token border border-ink/15 bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={working}
          className="cursor-pointer rounded-token bg-brand px-5 py-2.5 text-xs font-medium tracking-wide text-brand-ink disabled:opacity-50"
        >
          {working ? "작성 중…" : "AI로 글 쓰기"}
        </button>
      </form>
      {message ? <p className="text-xs text-ink-muted">{message}</p> : null}

      {posts.length > 0 ? (
        <ul className="divide-y divide-ink/5 rounded-token bg-surface shadow-sm ring-1 ring-ink/5">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">
                  <span className="mr-2 rounded-full bg-brand/5 px-2 py-0.5 text-[0.65rem] text-brand">
                    {KIND_LABELS[post.kind] ?? post.kind}
                  </span>
                  {post.title}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {post.status === "published" ? (
                  <a
                    href={`/${defaultLocale}/news/${post.slug}`}
                    className="text-xs text-ink-muted underline hover:text-ink"
                  >
                    보기
                  </a>
                ) : (
                  <>
                    <span className="text-xs text-accent">초안</span>
                    <button
                      type="button"
                      onClick={() => publish(post.id)}
                      className="cursor-pointer rounded-token border border-brand/30 px-3 py-1.5 text-xs text-brand hover:bg-brand hover:text-brand-ink"
                    >
                      발행
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
