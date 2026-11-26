import type { Catalog, Locale } from "@/lib/catalog/types";

/**
 * Plain-words working days from the work calendar (catalog.calendar), so the
 * policies page and the notes about delivery always match the dates the site
 * works out.
 */

const DAY_NAMES: Record<Locale, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
};

const MONTH_NAMES: Record<Locale, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

function joinNames(names: string[], locale: Locale): string {
  if (names.length <= 1) return names.join("");
  if (locale === "ar") return names.join(" و");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The days off, e.g. "Friday and Saturday" / "الجمعة والسبت". */
export function daysOff(catalog: Catalog, locale: Locale): string {
  return joinNames([...catalog.calendar.weekend].sort((a, b) => a - b).map((d) => DAY_NAMES[locale][d]!), locale);
}

/** The working days as a run when they follow each other, e.g. { from: "Sunday", to: "Thursday" }. */
export function workingRun(catalog: Catalog, locale: Locale): { from: string; to: string } | null {
  const off = new Set(catalog.calendar.weekend);
  const working = [0, 1, 2, 3, 4, 5, 6].filter((d) => !off.has(d));
  if (!working.length) return null;
  // Start the week on the first working day after a day off, so Sunday–Thursday reads that way round.
  const start = working.find((d) => off.has((d + 6) % 7)) ?? working[0]!;
  const run: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = (start + i) % 7;
    if (off.has(d)) break;
    run.push(d);
  }
  if (run.length !== working.length) return null;
  return { from: DAY_NAMES[locale][run[0]!]!, to: DAY_NAMES[locale][run[run.length - 1]!]! };
}

/** Holidays from the calendar in date order: yearly ones as "7 January", one-off ones with their year. */
export function holidayList(catalog: Catalog, locale: Locale, today = new Date()): string[] {
  const thisYear = today.getFullYear();
  return catalog.calendar.holidays
    .map((h) => {
      const parts = h.split("-").map(Number);
      const [y, m, d] = parts.length === 3 ? parts : [null, parts[0], parts[1]];
      return { y, m: m!, d: d! };
    })
    .filter((h) => h.y === null || h.y >= thisYear)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || a.m - b.m || a.d - b.d)
    .map((h) => `${h.d} ${MONTH_NAMES[locale][h.m - 1] ?? h.m}${h.y ? ` ${h.y}` : ""}`);
}
