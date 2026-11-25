import { TIER_ORDER } from "@/lib/catalog";
import type { Catalog, LocalizedText, MockupId, PrintMethod, SizeTier, Sleeve } from "@/lib/catalog/types";
import type { PrintSelection } from "@/lib/pricing/types";
import { specFor } from "@/lib/three/shape";
import { constrainElement, elementBBox, measuredFor, rotatedExtents, scaleElement, tierBoxCm, type Box, type LocalBBox, type TextMeasurement } from "./geometry";
import { placementOf } from "./placement";
import type { DesignElement } from "./types";

/**
 * Prints go anywhere on a side of the garment: the front, the back, either
 * sleeve or the hood. Each side has a printable panel, and artwork is placed
 * in millimetres from the panel's top-left corner, as you look at that side.
 * A side can hold several prints; each print's size (and price) comes from
 * the artwork in it.
 */

export type PrintSide = "front" | "back" | "leftSleeve" | "rightSleeve" | "hood";

export const PRINT_SIDES: PrintSide[] = ["front", "back", "leftSleeve", "rightSleeve", "hood"];

/** Most prints one side can hold. */
export const MAX_PRINTS_PER_SIDE = 6;

export function isPrintSide(id: string): id is PrintSide {
  return (PRINT_SIDES as string[]).includes(id);
}

export const sideNames: Record<PrintSide, LocalizedText> = {
  front: { en: "Front", ar: "الأمام" },
  back: { en: "Back", ar: "الخلف" },
  leftSleeve: { en: "Left sleeve", ar: "الكم الأيسر" },
  rightSleeve: { en: "Right sleeve", ar: "الكم الأيمن" },
  hood: { en: "Hood", ar: "الكابيشون" },
};

const HOODED: MockupId[] = ["hoodie", "zipHoodie"];

/** The sides a garment can be printed on. */
export function sidesFor(mockup: MockupId): PrintSide[] {
  return HOODED.includes(mockup) ? PRINT_SIDES : PRINT_SIDES.filter((s) => s !== "hood");
}

/** Which way the garment turns to show a side. */
export function sideView(side: string): "front" | "back" | "left" | "right" {
  if (side === "back" || side === "hood") return "back";
  if (side === "leftSleeve") return "left";
  if (side === "rightSleeve") return "right";
  return "front";
}

export interface SidePanel {
  /** Printable width and height, cm. */
  wCm: number;
  hCm: number;
  /**
   * Where the panel's top edge is: cm below the neckline (front and back),
   * below the shoulder seam (sleeves), or above the hood's neck seam (hood).
   */
  topCm: number;
}

const half = (v: number) => Math.round(v * 2) / 2;

/** The printable panel of a side, from the garment's measurements. */
export function sidePanel(mockup: MockupId, sleeve: Sleeve, side: PrintSide): SidePanel {
  const s = specFor(mockup, "regular");
  switch (side) {
    case "front":
      return { wCm: 40, hCm: half(s.length - s.frontNeckDrop - s.band - 5), topCm: 2 };
    case "back":
      return { wCm: 40, hCm: half(s.length - s.backNeckDrop - s.band - 5), topCm: 2 };
    case "leftSleeve":
    case "rightSleeve": {
      const long = sleeve === "long";
      return { wCm: long ? 10 : 9, hCm: half((long ? s.sleeveLong - s.cuff : s.sleeveShort) - 4), topCm: 2 };
    }
    case "hood":
      // The back of the hood, from 1.5 cm above the neck seam.
      return { wCm: 18, hCm: 12, topCm: 13.5 };
  }
}

export function panelBox(mockup: MockupId, sleeve: Sleeve, side: PrintSide): Box {
  const p = sidePanel(mockup, sleeve, side);
  return { w: p.wCm * 10, h: p.hCm * 10 };
}

/* ---------- size and price tier ---------- */

const TIER_CM: Record<Exclude<SizeTier, "AO">, [number, number]> = { S: [10, 10], M: [21, 30], L: [30, 42] };

/** Fits within w × h cm, either way round. */
function fits(wCm: number, hCm: number, [a, b]: [number, number]): boolean {
  const e = 0.05;
  return (wCm <= a + e && hCm <= b + e) || (wCm <= b + e && hCm <= a + e);
}

/** Price tier for a print of this size: up to 10 × 10 cm Small, up to A4 Medium, up to A3 Large, bigger All-over. */
export function tierForSize(wCm: number, hCm: number): SizeTier {
  if (fits(wCm, hCm, TIER_CM.S)) return "S";
  if (fits(wCm, hCm, TIER_CM.M)) return "M";
  if (fits(wCm, hCm, TIER_CM.L)) return "L";
  return "AO";
}

/** Largest size a print method is priced for. */
export function maxTierOf(method: PrintMethod): SizeTier {
  return [...TIER_ORDER].reverse().find((t) => method.prices[t] !== undefined) ?? "S";
}

/** Biggest print a tier allows, cm (null = no limit but the panel). */
export function tierLimitCm(tier: SizeTier): [number, number] | null {
  return tier === "AO" ? null : TIER_CM[tier];
}

/**
 * The artwork's outline on its panel (mm), or null when there's none. Text
 * uses its measured size when given; prices always use the estimate, so the
 * browser and the server agree.
 */
export function printBounds(elements: DesignElement[] | undefined, measurements?: Record<string, TextMeasurement>): LocalBBox | null {
  if (!elements?.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of elements) {
    const e = rotatedExtents(elementBBox(el, measuredFor(el, measurements?.[el.id])), el.rotation);
    x0 = Math.min(x0, el.x + e.minX);
    y0 = Math.min(y0, el.y + e.minY);
    x1 = Math.max(x1, el.x + e.maxX);
    y1 = Math.max(y1, el.y + e.maxY);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A print's size tier, from its artwork (Small until it has some). */
export function printTier(print: Pick<PrintSelection, "elements">): SizeTier {
  const b = printBounds(print.elements);
  return b ? tierForSize(b.w / 10, b.h / 10) : "S";
}

/** True when the artwork is no bigger than the method allows. */
export function fitsMethod(elements: DesignElement[] | undefined, method: PrintMethod): boolean {
  return TIER_ORDER.indexOf(printTier({ elements })) <= TIER_ORDER.indexOf(maxTierOf(method));
}

/** Shrinks the artwork around its middle until it fits the largest size the method allows. */
export function fitToMethod(elements: DesignElement[], method: PrintMethod): DesignElement[] {
  const limit = tierLimitCm(maxTierOf(method));
  const b = printBounds(elements);
  if (!limit || !b || fits(b.w / 10, b.h / 10, limit)) return elements;
  const [a, c] = limit;
  const k = Math.min(1, Math.max(Math.min((a * 10) / b.w, (c * 10) / b.h), Math.min((c * 10) / b.w, (a * 10) / b.h))) * 0.995;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return elements.map((el) => ({ ...scaleElement(el, k), x: cx + (el.x - cx) * k, y: cy + (el.y - cy) * k }));
}

/** Keeps every element inside the side's panel. */
export function constrainToPanel(elements: DesignElement[], panel: Box): DesignElement[] {
  return elements.map((el) => constrainElement(el, panel));
}

/**
 * The part of the panel a print's picture covers (mm): the artwork with a
 * little room around it (text not measured yet gets extra, in case its font
 * runs wide), or the guide square when it has no artwork yet.
 */
export function printRenderRect(elements: DesignElement[] | undefined, panel: Box, measurements?: Record<string, TextMeasurement>, pad = 2): LocalBBox {
  if (!elements?.length) return placeholderRect(panel);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const el of elements) {
    const measured = measuredFor(el, measurements?.[el.id]);
    let b = elementBBox(el, measured);
    if (el.type === "text" && !measured) b = { x: b.x - b.w * 0.2, y: b.y - b.h * 0.1, w: b.w * 1.4, h: b.h * 1.2 };
    const e = rotatedExtents(b, el.rotation);
    x0 = Math.min(x0, el.x + e.minX);
    y0 = Math.min(y0, el.y + e.minY);
    x1 = Math.max(x1, el.x + e.maxX);
    y1 = Math.max(y1, el.y + e.maxY);
  }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(panel.w, x1 + pad);
  y1 = Math.min(panel.h, y1 + pad);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Room (mm) left around a print's artwork when it's drawn: patches need more, as the patch itself goes around it. */
export function renderPad(patch: boolean): number {
  return patch ? 10 : 2;
}

/** Where an empty print shows as a guide: a 10 cm square near the top middle. */
export function placeholderRect(panel: Box): LocalBBox {
  const w = Math.min(100, panel.w);
  const h = Math.min(100, panel.h);
  return { x: (panel.w - w) / 2, y: Math.min(panel.h - h, Math.max(0, panel.h * 0.18)), w, h };
}

/* ---------- where a print sits on the garment ---------- */

export interface RectPlacement {
  side: PrintSide;
  /** Middle of the print, cm to the right of the side's center line (as you look at that side). */
  cxCm: number;
  /** Top edge: cm below the neckline (front, back) or shoulder seam (sleeves); for the hood, cm above its neck seam. */
  topCm: number;
  wCm: number;
  hCm: number;
}

/** A rectangle on a side's panel (mm) as a position on the garment. */
export function placeRect(mockup: MockupId, sleeve: Sleeve, side: PrintSide, rect: LocalBBox): RectPlacement {
  const panel = sidePanel(mockup, sleeve, side);
  const cxCm = (rect.x + rect.w / 2) / 10 - panel.wCm / 2;
  const topCm = side === "hood" ? panel.topCm - rect.y / 10 : panel.topCm + rect.y / 10;
  return { side, cxCm, topCm, wCm: rect.w / 10, hCm: rect.h / 10 };
}

/** A fixed name or number area (src/lib/design/placement.ts) as a place on the garment. */
export function areaRect(areaId: string, sleeve: Sleeve, wCm: number, hCm: number): RectPlacement | null {
  const p = placementOf(areaId, sleeve);
  if (!p) return null;
  switch (p.from) {
    case "frontNeck":
      // Seen from the front, the wearer's left is on the viewer's right.
      return { side: "front", cxCm: p.sideCm, topCm: p.downCm, wCm, hCm };
    case "backNeck":
      return { side: "back", cxCm: -p.sideCm, topCm: p.downCm, wCm, hCm };
    case "shoulder":
      return { side: p.sleeve === 1 ? "leftSleeve" : "rightSleeve", cxCm: 0, topCm: p.downCm, wCm, hCm };
    case "hoodSeam":
      return { side: "hood", cxCm: 0, topCm: p.downCm, wCm, hCm };
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The placement as a workshop instruction (English, like the rest of the workshop sheet). */
export function rectPlacementText(p: RectPlacement): string {
  const off = r1(Math.abs(p.cxCm));
  const centered = off < 0.5;
  switch (p.side) {
    case "front":
    case "back": {
      // Seen from the front, the viewer's right is the wearer's left; from the back it's the wearer's right.
      const wearerLeft = p.side === "front" ? p.cxCm > 0 : p.cxCm < 0;
      const across = centered ? "centered" : `its middle ${off} cm to the wearer's ${wearerLeft ? "left" : "right"} of the center`;
      return `Top of the print ${r1(p.topCm)} cm below the ${p.side} neckline, ${across}.`;
    }
    case "leftSleeve":
    case "rightSleeve":
      return `Top of the print ${r1(p.topCm)} cm down the ${p.side === "leftSleeve" ? "left" : "right"} sleeve from the shoulder seam, ${centered ? "centered on the sleeve" : `${off} cm off the sleeve's middle line`}.`;
    case "hood":
      return `On the back of the hood, top of the print ${r1(p.topCm)} cm above the neck seam, ${centered ? "centered" : `${off} cm off the middle seam`}.`;
  }
}

/* ---------- designs saved before free placement ---------- */

let printCounter = 0;

export function newPrintId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `p-${crypto.randomUUID().slice(0, 8)}`;
  printCounter += 1;
  return `p-${Date.now().toString(36)}${printCounter.toString(36)}`;
}

/** A print in the old shape: a fixed area (left chest, full back…) and a chosen size. */
export interface LegacyPrint {
  areaId: string;
  methodId: string;
  tier: SizeTier;
  colorCount?: number;
  elements?: DesignElement[];
}

/**
 * Turns a print saved for a fixed area into a free print on its side, with
 * the artwork exactly where it was. Null when the area is unknown.
 */
export function migrateLegacyPrint(catalog: Catalog, mockup: MockupId, sleeve: Sleeve, print: LegacyPrint, id = newPrintId()): PrintSelection | null {
  const where = placementOf(print.areaId, sleeve);
  const area = catalog.printAreas.find((a) => a.id === print.areaId);
  if (!where || !area) return null;
  const [w, h] = tierBoxCm(area, print.tier);
  let side: PrintSide;
  let left: number;
  let top: number;
  switch (where.from) {
    case "frontNeck": {
      side = "front";
      const panel = sidePanel(mockup, sleeve, side);
      left = panel.wCm / 2 + where.sideCm - w / 2;
      top = where.downCm - panel.topCm;
      break;
    }
    case "backNeck": {
      side = "back";
      const panel = sidePanel(mockup, sleeve, side);
      left = panel.wCm / 2 - where.sideCm - w / 2;
      top = where.downCm - panel.topCm;
      break;
    }
    case "shoulder": {
      side = where.sleeve === 1 ? "leftSleeve" : "rightSleeve";
      const panel = sidePanel(mockup, sleeve, side);
      left = panel.wCm / 2 - w / 2;
      top = where.downCm - panel.topCm;
      break;
    }
    case "hoodSeam": {
      side = "hood";
      const panel = sidePanel(mockup, sleeve, side);
      left = panel.wCm / 2 - w / 2;
      top = panel.topCm - where.downCm;
      break;
    }
  }
  const elements = (print.elements ?? []).map((el) => ({ ...el, x: el.x + left * 10, y: el.y + top * 10 }));
  return {
    id,
    areaId: side,
    methodId: print.methodId,
    tier: printTier({ elements }),
    ...(print.colorCount ? { colorCount: print.colorCount } : {}),
    elements,
  };
}
