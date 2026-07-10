"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Check-in / check-out / guests → /{locale}/booking search. Pure navigation;
 * availability is rendered server-side on the booking page.
 */
export function BookingSearchBar({
  locale,
  compact = false,
  initial,
}: {
  locale: string;
  compact?: boolean;
  initial?: { checkIn?: string; checkOut?: string; adults?: number; children?: number };
}) {
  const t = useTranslations("booking");
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? plusDays(7));
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? plusDays(8));
  const [adults, setAdults] = useState(initial?.adults ?? 2);
  const [children, setChildren] = useState(initial?.children ?? 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({
      checkIn,
      checkOut,
      adults: String(adults),
      children: String(children),
    });
    router.push(`/${locale}/booking?${params.toString()}`);
  }

  const fieldCls =
    "w-full bg-transparent text-sm text-ink outline-none [color-scheme:light]";
  const cellCls = "flex flex-col gap-1 border-ink/10 px-4 py-3 sm:border-r";
  const labelCls =
    "text-[0.65rem] font-medium uppercase tracking-[0.18em] text-ink-muted";

  return (
    <form
      onSubmit={submit}
      className={`grid w-full grid-cols-2 items-stretch overflow-hidden rounded-token border border-ink/10 bg-surface/95 shadow-xl backdrop-blur sm:grid-cols-[1fr_1fr_0.7fr_0.7fr_auto] ${
        compact ? "" : "sm:min-w-[640px]"
      }`}
    >
      <label className={cellCls}>
        <span className={labelCls}>{t("checkIn")}</span>
        <input
          type="date"
          required
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          className={fieldCls}
        />
      </label>
      <label className={cellCls}>
        <span className={labelCls}>{t("checkOut")}</span>
        <input
          type="date"
          required
          min={checkIn}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          className={fieldCls}
        />
      </label>
      <label className={cellCls}>
        <span className={labelCls}>{t("adults")}</span>
        <input
          type="number"
          min={1}
          max={10}
          value={adults}
          onChange={(e) => setAdults(Number(e.target.value))}
          className={fieldCls}
        />
      </label>
      <label className={cellCls}>
        <span className={labelCls}>{t("children")}</span>
        <input
          type="number"
          min={0}
          max={10}
          value={children}
          onChange={(e) => setChildren(Number(e.target.value))}
          className={fieldCls}
        />
      </label>
      <button
        type="submit"
        className="col-span-2 cursor-pointer bg-brand px-8 py-4 text-sm font-medium tracking-wide text-brand-ink transition-opacity hover:opacity-90 sm:col-span-1"
      >
        {t("search")}
      </button>
    </form>
  );
}
