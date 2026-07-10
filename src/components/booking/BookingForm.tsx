"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Guest details → POST /api/reservations. The server re-validates the quote
 * (expectedTotal) and the inventory RPC is the final arbiter — this form
 * only ever holds a *claim* to a price, never authority over it.
 */
export function BookingForm({
  locale,
  roomTypeId,
  ratePlanId,
  checkIn,
  checkOut,
  adults,
  children,
  expectedTotal,
}: {
  locale: string;
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  expectedTotal: number;
}) {
  const t = useTranslations("booking");
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomTypeId,
          ratePlanId,
          checkIn,
          checkOut,
          rooms: 1,
          adults,
          children,
          expectedTotal,
          guest: {
            name: form.get("name"),
            email,
            phone: form.get("phone") || undefined,
            requests: form.get("requests") || undefined,
            locale,
          },
        }),
      });
      const json = await res.json();

      if (json.ok) {
        const query = new URLSearchParams({ code: json.code, email });
        router.push(`/${locale}/booking/complete?${query.toString()}`);
        return;
      }
      const key = `errors.${json.error}`;
      setError(t.has(key) ? t(key) : t("errors.unknown"));
      setSubmitting(false);
    } catch {
      setError(t("errors.unknown"));
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-token border border-ink/15 bg-surface px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-brand";
  const labelCls =
    "mb-1.5 block text-xs font-medium uppercase tracking-[0.15em] text-ink-muted";

  return (
    <form onSubmit={submit} className="space-y-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-ink-muted">
        {t("guestInfo")}
      </h2>

      <div>
        <label htmlFor="bf-name" className={labelCls}>{t("name")}</label>
        <input id="bf-name" name="name" required maxLength={100} className={inputCls} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="bf-email" className={labelCls}>{t("email")}</label>
          <input id="bf-email" name="email" type="email" required maxLength={200} className={inputCls} />
        </div>
        <div>
          <label htmlFor="bf-phone" className={labelCls}>{t("phone")}</label>
          <input id="bf-phone" name="phone" maxLength={40} className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor="bf-requests" className={labelCls}>{t("requests")}</label>
        <textarea id="bf-requests" name="requests" rows={4} maxLength={1000} className={inputCls} />
      </div>

      <p className="text-xs text-ink-muted">{t("agreeNotice")}</p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full cursor-pointer bg-brand px-8 py-4 text-sm font-medium tracking-widest text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? t("processing") : t("confirm")}
      </button>
    </form>
  );
}
