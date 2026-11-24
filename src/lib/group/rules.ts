/** Pure rules for group orders, shared by the server and the pages. */

/** Today's date in Cairo as "YYYY-MM-DD". */
export function cairoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Joining stays open through the whole deadline day (Cairo time). */
export function beforeDeadline(deadline: string, now = new Date()): boolean {
  return cairoToday(now) <= deadline;
}

/** Whole days left until the deadline day (0 on the last day). */
export function daysLeft(deadline: string, now = new Date()): number {
  const [y1, m1, d1] = cairoToday(now).split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = deadline.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Adds days to a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Loose name matching for duplicates and the class list: ignores case, extra
 * spaces, punctuation and common Arabic spelling variants (أ/إ/آ/ا, ة/ه, ى/ي, tashkeel).
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Egyptian mobile numbers in any common form ("010 1234 5678", "+20 10…",
 * Arabic digits) become "01012345678". Returns null if it isn't one.
 */
export function normalizePhone(phone: string): string | null {
  const western = phone.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const digits = western.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const local = digits.startsWith("20") && digits.length === 12 ? `0${digits.slice(2)}` : digits.startsWith("0020") ? `0${digits.slice(4)}` : digits;
  return /^01[0125]\d{8}$/.test(local) ? local : null;
}

export function onNameList(name: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const n = normalizeName(name);
  return allowed.some((a) => normalizeName(a) === n);
}
