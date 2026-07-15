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

/**
 * Format a date for display.
 *
 * Accepts either a bare calendar date ("YYYY-MM-DD") or a full ISO timestamp:
 *  - a bare date is pinned to midnight UTC and shown in UTC, so a check-in
 *    date never drifts to the day before/after by timezone;
 *  - a full timestamp is shown in `timeZone` (default UTC). Pass the hotel's
 *    timezone for things like a post's publish time, so "published today" is
 *    the hotel's today — not the server's UTC day.
 */
export function formatDate(
  value: string,
  locale: string,
  timeZone: string = "UTC",
): string {
  try {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = isDateOnly ? new Date(`${value}T00:00:00Z`) : new Date(value);
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      timeZone: isDateOnly ? "UTC" : timeZone,
    }).format(date);
  } catch {
    return value;
  }
}
