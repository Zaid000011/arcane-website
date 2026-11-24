import type { LocalizedText, Locale, Product, SizeTier, Sleeve } from "./types";

export type * from "./types";

// The live catalog (with the owner's saved prices) comes from getLiveCatalog() in src/server/catalog-store.ts.

export function tr(text: LocalizedText, locale: Locale): string {
  return text[locale] || text.en;
}

export const TIER_ORDER: SizeTier[] = ["S", "M", "L", "AO"];

export const tierLabels: Record<SizeTier, LocalizedText> = {
  S: { en: "Small", ar: "صغير" },
  M: { en: "Medium", ar: "متوسط" },
  L: { en: "Large", ar: "كبير" },
  AO: { en: "All-over", ar: "طباعة كاملة" },
};

export const tierHints: Record<SizeTier, LocalizedText> = {
  S: { en: "Up to 10 × 10 cm", ar: "حتى 10 × 10 سم" },
  M: { en: "Up to A4 (21 × 30 cm)", ar: "حتى A4 (21 × 30 سم)" },
  L: { en: "Up to A3 (30 × 42 cm)", ar: "حتى A3 (30 × 42 سم)" },
  AO: { en: "Covers the whole panel", ar: "تغطي الجزء بالكامل" },
};

export const sleeveLabels: Record<Sleeve, LocalizedText> = {
  short: { en: "Short sleeve", ar: "كم قصير" },
  long: { en: "Long sleeve", ar: "كم طويل" },
};

export function tierAtMost(tier: SizeTier, max: SizeTier): boolean {
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(max);
}

/** Lowest base price of a product across its sleeve options. */
export function startingPrice(product: Product): number {
  return Math.min(...Object.values(product.basePrice).filter((v): v is number => typeof v === "number"));
}
