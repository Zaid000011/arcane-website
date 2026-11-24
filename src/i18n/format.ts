import type { Locale } from "./config";

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "EGP 1,250" in English, "1,250 ج.م" in Arabic. */
export function formatMoney(amount: number, locale: Locale): string {
  const sign = amount < 0 ? "−" : "";
  const n = numberFormat.format(Math.abs(Math.round(amount)));
  return locale === "ar" ? `${sign}${n} ج.م` : `${sign}EGP ${n}`;
}

/** Signed amount for price modifiers: "+EGP 40", "−EGP 20". */
export function formatDelta(amount: number, locale: Locale): string {
  if (amount === 0) return locale === "ar" ? "مشمول" : "Included";
  return `${amount > 0 ? "+" : ""}${formatMoney(amount, locale)}`;
}

/** Replaces {name} placeholders. */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in params ? String(params[key]) : `{${key}}`));
}
