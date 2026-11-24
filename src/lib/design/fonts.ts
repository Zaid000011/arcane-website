/** Fonts offered in the text tool. Brand fonts reuse the site's self-hosted copies. */

export interface DesignFont {
  id: string;
  label: string;
  /** CSS font-family value. */
  family: string;
  weight: number;
  script: "latin" | "arabic";
  /** Google Fonts css2 "family=" value, for fonts not already on the page. */
  google?: string;
}

export const designFonts: DesignFont[] = [
  { id: "anton", label: "Anton", family: "var(--font-anton), Impact, sans-serif", weight: 400, script: "latin" },
  { id: "graduate", label: "Graduate", family: "'Graduate', serif", weight: 400, script: "latin", google: "Graduate" },
  { id: "bebas", label: "Bebas Neue", family: "'Bebas Neue', sans-serif", weight: 400, script: "latin", google: "Bebas+Neue" },
  { id: "alfaSlab", label: "Alfa Slab One", family: "'Alfa Slab One', serif", weight: 400, script: "latin", google: "Alfa+Slab+One" },
  { id: "unifraktur", label: "Old English", family: "'UnifrakturMaguntia', serif", weight: 400, script: "latin", google: "UnifrakturMaguntia" },
  { id: "pacifico", label: "Pacifico", family: "'Pacifico', cursive", weight: 400, script: "latin", google: "Pacifico" },
  { id: "cinzel", label: "Cinzel", family: "var(--font-cinzel), serif", weight: 700, script: "latin" },
  { id: "playfair", label: "Playfair", family: "'Playfair Display', serif", weight: 700, script: "latin", google: "Playfair+Display:wght@700" },
  { id: "bungee", label: "Bungee", family: "'Bungee', sans-serif", weight: 400, script: "latin", google: "Bungee" },
  { id: "orbitron", label: "Orbitron", family: "'Orbitron', sans-serif", weight: 700, script: "latin", google: "Orbitron:wght@700" },
  { id: "inter", label: "Inter", family: "var(--font-inter), sans-serif", weight: 700, script: "latin" },
  { id: "cairo", label: "Cairo", family: "var(--font-cairo), sans-serif", weight: 800, script: "arabic" },
  { id: "lalezar", label: "Lalezar", family: "'Lalezar', sans-serif", weight: 400, script: "arabic", google: "Lalezar" },
  { id: "reemKufi", label: "Reem Kufi", family: "'Reem Kufi', sans-serif", weight: 700, script: "arabic", google: "Reem+Kufi:wght@700" },
  { id: "arefRuqaa", label: "Aref Ruqaa", family: "'Aref Ruqaa', serif", weight: 700, script: "arabic", google: "Aref+Ruqaa:wght@700" },
  { id: "amiri", label: "Amiri", family: "'Amiri', serif", weight: 700, script: "arabic", google: "Amiri:wght@700" },
  { id: "elMessiri", label: "El Messiri", family: "'El Messiri', sans-serif", weight: 700, script: "arabic", google: "El+Messiri:wght@700" },
];

export const googleFontsHref = `https://fonts.googleapis.com/css2?${designFonts
  .filter((f) => f.google)
  .map((f) => `family=${f.google}`)
  .join("&")}&display=swap`;

export function fontById(id: string): DesignFont {
  return designFonts.find((f) => f.id === id) ?? designFonts[0]!;
}

export const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabic(text: string): boolean {
  return ARABIC_RE.test(text);
}

/** Starting font for new text: Arabic text gets an Arabic font. */
export function defaultFontFor(text: string): string {
  return hasArabic(text) ? "cairo" : "anton";
}
