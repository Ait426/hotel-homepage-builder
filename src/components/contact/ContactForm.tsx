"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm({ locale }: { locale: string }) {
  const t = useTranslations("contact");
  // name/email/phone field labels are shared with the booking form
  const tb = useTranslations("booking");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone") || undefined,
          subject: form.get("subject") || undefined,
          body: form.get("message"),
          reservationCode: form.get("reservationCode") || undefined,
          locale,
        }),
      });
      const json = await res.json();
      setStatus(json.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p className="rounded-token border border-brand/20 bg-brand/5 p-6 text-center text-sm text-ink">
        {t("sent")}
      </p>
    );
  }

  const inputCls =
    "w-full rounded-token border border-ink/15 bg-surface px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-brand";
  const labelCls =
    "mb-1.5 block text-xs font-medium uppercase tracking-[0.15em] text-ink-muted";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-name" className={labelCls}>{tb("name")}</label>
          <input id="cf-name" name="name" required maxLength={100} className={inputCls} />
        </div>
        <div>
          <label htmlFor="cf-email" className={labelCls}>{tb("email")}</label>
          <input id="cf-email" name="email" type="email" required maxLength={200} className={inputCls} />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="cf-phone" className={labelCls}>{tb("phone")}</label>
          <input id="cf-phone" name="phone" maxLength={40} className={inputCls} />
        </div>
        <div>
          <label htmlFor="cf-code" className={labelCls}>{t("reservationCode")}</label>
          <input id="cf-code" name="reservationCode" maxLength={40} className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor="cf-subject" className={labelCls}>{t("subject")}</label>
        <input id="cf-subject" name="subject" maxLength={200} className={inputCls} />
      </div>
      <div>
        <label htmlFor="cf-message" className={labelCls}>{t("message")}</label>
        <textarea id="cf-message" name="message" required rows={6} maxLength={5000} className={inputCls} />
      </div>

      {status === "error" ? (
        <p className="text-sm text-red-600">{t("error")}</p>
      ) : null}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full cursor-pointer rounded-token bg-brand px-8 py-4 text-sm font-medium tracking-wide text-brand-ink transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {status === "sending" ? t("sending") : t("send")}
      </button>
    </form>
  );
}
