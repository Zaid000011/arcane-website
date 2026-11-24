import type { Catalog, Locale } from "@/lib/catalog/types";

const pad = (n: number) => String(n).padStart(2, "0");

export function isWorkingDay(date: Date, calendar: Catalog["calendar"]): boolean {
  if (calendar.weekend.includes(date.getDay())) return false;
  const mmdd = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return !calendar.holidays.includes(mmdd) && !calendar.holidays.includes(`${date.getFullYear()}-${mmdd}`);
}

/** The date after counting `days` working days from `start` (start itself isn't counted). */
export function addWorkingDays(start: Date, days: number, calendar: Catalog["calendar"]): Date {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let added = 0;
  // Guard against a calendar with no working days at all.
  for (let guard = 0; added < days && guard < 3660; guard++) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d, calendar)) added++;
  }
  return d;
}

export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
}
