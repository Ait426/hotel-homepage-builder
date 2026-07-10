/**
 * Calendar-date helpers. The booking domain works exclusively with
 * hotel-local calendar dates as "yyyy-mm-dd" strings (ISODate) — never
 * timestamps — so DST/timezone math can't corrupt a stay range.
 */

import type { ISODate } from "@/lib/data/types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: string): value is ISODate {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISODate(dt);
}

export function nightsBetween(checkIn: ISODate, checkOut: ISODate): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Every night of a stay: [checkIn, checkOut) */
export function eachNight(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const nights: ISODate[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    nights.push(d);
    if (nights.length > 366) break; // sanity cap
  }
  return nights;
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Today as a calendar date in the hotel's timezone. */
export function todayIn(timezone: string): ISODate {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()) as ISODate;
}
