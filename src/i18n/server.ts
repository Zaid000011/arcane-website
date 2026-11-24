import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { ar } from "./dictionaries/ar";
import { en, type Dictionary } from "./dictionaries/en";

export async function getLocale(): Promise<Locale> {
  // The GitHub Pages copy is built once per language, so its language is fixed.
  const fixed = process.env.NEXT_PUBLIC_STATIC_LOCALE;
  if (isLocale(fixed)) return fixed;
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

export function getDictionary(locale: Locale): Dictionary {
  return locale === "ar" ? ar : en;
}
