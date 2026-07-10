/** Money/date presentation helpers (Intl-based, no deps). */

export function formatMoney(
  amount: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "KRW" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

export function formatDate(isoDate: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${isoDate}T00:00:00Z`));
  } catch {
    return isoDate;
  }
}
