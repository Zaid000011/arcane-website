import type { Product } from "@/lib/catalog/types";
import type { DesignSelection, PersonalStyle, PersonalizationSelection } from "@/lib/pricing/types";

export type PersonalKind = "name" | "number" | "namesList";

/** Where each kind of personalization can go, best placement first. */
const PLACEMENTS: Record<PersonalKind, string[]> = {
  name: ["backUpper", "leftSleeve", "rightSleeve", "leftChest", "rightChest", "fullBack"],
  number: ["fullBack", "frontCenter", "leftChest", "rightChest", "leftSleeve", "rightSleeve"],
  namesList: ["fullBack", "backUpper"],
};

export function placementsFor(kind: PersonalKind, product: Product): string[] {
  return PLACEMENTS[kind].filter((id) => product.printAreaIds.includes(id));
}

export function defaultStyle(kind: PersonalKind, product: Product, ink: string): PersonalStyle | undefined {
  const areaId = placementsFor(kind, product)[0];
  if (!areaId) return undefined;
  if (kind === "name") return { areaId, fontId: "graduate", color: ink, sizeMm: 50 };
  if (kind === "number") return { areaId, fontId: "graduate", color: ink, sizeMm: 180 };
  return { areaId, fontId: "anton", color: ink, sizeMm: 12 };
}

const STYLE_KEY: Record<PersonalKind, "nameStyle" | "numberStyle" | "namesListStyle"> = {
  name: "nameStyle",
  number: "numberStyle",
  namesList: "namesListStyle",
};

export function styleKey(kind: PersonalKind) {
  return STYLE_KEY[kind];
}

/** Keeps personalization valid for the current product (e.g. after switching garments). */
export function normalizePersonalization(product: Product, p: PersonalizationSelection): PersonalizationSelection {
  const next: PersonalizationSelection = { ...p };
  for (const kind of ["name", "number", "namesList"] as const) {
    const key = STYLE_KEY[kind];
    const style = next[key];
    if (!style) continue;
    const allowed = placementsFor(kind, product);
    if (!allowed.includes(style.areaId)) {
      if (allowed[0]) next[key] = { ...style, areaId: allowed[0] };
      else delete next[key];
    }
  }
  if (next.namesListNames) next.namesListCount = next.namesListNames.length;
  return next;
}

/** Turns a personalization on with sensible styling, or off. */
export function togglePersonal(product: Product, d: DesignSelection, kind: PersonalKind, on: boolean, ink: string): DesignSelection {
  const flag = kind === "name" ? "names" : kind === "number" ? "numbers" : "namesList";
  const key = STYLE_KEY[kind];
  const p = { ...d.personalization, [flag]: on };
  if (on && !p[key]) {
    const style = defaultStyle(kind, product, ink);
    if (style) p[key] = style;
  }
  return { ...d, personalization: p };
}

/**
 * Lays out the class names list in a grid that fills the box with the
 * largest readable text. Sizes in mm.
 */
export function namesGrid(names: string[], boxW: number, boxH: number): { columns: number; rows: number; fontSize: number } {
  if (names.length === 0) return { columns: 1, rows: 0, fontSize: 0 };
  const longest = Math.max(...names.map((n) => n.length), 3);
  let best = { columns: 1, rows: names.length, fontSize: 0 };
  for (let columns = 1; columns <= 8; columns++) {
    const rows = Math.ceil(names.length / columns);
    const cellW = boxW / columns;
    const cellH = boxH / rows;
    const fontSize = Math.min(cellH * 0.78, (cellW * 0.92) / (longest * 0.56));
    if (fontSize > best.fontSize) best = { columns, rows, fontSize };
  }
  return best;
}
