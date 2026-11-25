import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { fontById } from "./fonts";
import { constrainElement, measuredFor, type Box, type TextMeasurement } from "./geometry";
import { fitsMethod, isPrintSide, panelBox, printTier } from "./sides";
import { newElementId, type ClipartElement, type DesignElement, type ImageElement, type TextElement } from "./types";

/** Pure operations on a print's artwork. Positions are mm on the side's printable panel. */

/** The printable panel a print's artwork lives on (mm). */
export function boxFor(catalog: Catalog, d: DesignSelection, print: PrintSelection): Box | null {
  const product = catalog.products.find((p) => p.id === d.productId);
  return product && isPrintSide(print.areaId) ? panelBox(product.mockup, d.sleeve, print.areaId) : null;
}

function withTier(p: PrintSelection, elements: DesignElement[]): PrintSelection {
  return { ...p, elements, tier: printTier({ elements }) };
}

function mapPrint(d: DesignSelection, printId: string, fn: (p: PrintSelection) => PrintSelection): DesignSelection {
  return { ...d, prints: d.prints.map((p) => (p.id === printId ? fn(p) : p)) };
}

export function findPrint(d: DesignSelection, printId: string): PrintSelection | undefined {
  return d.prints.find((p) => p.id === printId);
}

export function findElement(d: DesignSelection, printId: string, elementId: string): DesignElement | undefined {
  return findPrint(d, printId)?.elements?.find((e) => e.id === elementId);
}

export function addElement(catalog: Catalog, d: DesignSelection, printId: string, el: DesignElement): DesignSelection {
  return mapPrint(d, printId, (p) => {
    const box = boxFor(catalog, d, p);
    return withTier(p, [...(p.elements ?? []), box ? constrainElement(el, box) : el]);
  });
}

/**
 * Updates one element and keeps it on the panel. Text is only constrained
 * when its real rendered size is known (`measurement`); otherwise the
 * designer fits it right after the browser measures it. A change that would
 * make the print bigger than its print type allows is ignored.
 */
export function updateElement(
  catalog: Catalog,
  d: DesignSelection,
  printId: string,
  elementId: string,
  patch: Partial<DesignElement>,
  measurement?: TextMeasurement,
): DesignSelection {
  const print = findPrint(d, printId);
  if (!print) return d;
  const box = boxFor(catalog, d, print);
  const elements = (print.elements ?? []).map((e) => {
    if (e.id !== elementId) return e;
    const next = { ...e, ...patch, id: e.id, type: e.type } as DesignElement;
    if (!box) return next;
    if (next.type === "text") {
      const bbox = measuredFor(next, measurement);
      return bbox ? constrainElement(next, box, bbox) : next;
    }
    return constrainElement(next, box);
  });
  const method = catalog.printMethods.find((m) => m.id === print.methodId);
  if (method && !fitsMethod(elements, method) && fitsMethod(print.elements, method)) return d;
  return mapPrint(d, printId, (p) => withTier(p, elements));
}

/**
 * Shrinks or moves text that ended up off its panel once the browser
 * measured it. Returns the same object when nothing needed fixing.
 */
export function fitMeasuredText(catalog: Catalog, d: DesignSelection, measurements: Record<string, TextMeasurement>): DesignSelection {
  let changed = false;
  const prints = d.prints.map((p) => {
    const box = boxFor(catalog, d, p);
    if (!box || !p.elements?.some((e) => e.type === "text")) return p;
    const elements = p.elements.map((e) => {
      if (e.type !== "text") return e;
      const bbox = measuredFor(e, measurements[e.id]);
      if (!bbox) return e;
      const fitted = constrainElement(e, box, bbox);
      const moved = Math.abs(fitted.x - e.x) > 0.3 || Math.abs(fitted.y - e.y) > 0.3 || fitted.size < e.size * 0.995;
      if (!moved) return e;
      changed = true;
      return fitted;
    });
    return withTier(p, elements);
  });
  return changed ? { ...d, prints } : d;
}

export function removeElement(d: DesignSelection, printId: string, elementId: string): DesignSelection {
  return mapPrint(d, printId, (p) => withTier(p, (p.elements ?? []).filter((e) => e.id !== elementId)));
}

export function duplicateElement(catalog: Catalog, d: DesignSelection, printId: string, elementId: string): { design: DesignSelection; newId: string | null } {
  const el = findElement(d, printId, elementId);
  if (!el) return { design: d, newId: null };
  const copy = { ...el, id: newElementId(), x: el.x + 12, y: el.y + 12, locked: false } as DesignElement;
  return { design: addElement(catalog, d, printId, copy), newId: copy.id };
}

/** Moves an element one step toward the front (+1) or back (−1). */
export function moveLayer(d: DesignSelection, printId: string, elementId: string, direction: 1 | -1): DesignSelection {
  return mapPrint(d, printId, (p) => {
    const list = [...(p.elements ?? [])];
    const i = list.findIndex((e) => e.id === elementId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return p;
    [list[i], list[j]] = [list[j]!, list[i]!];
    return { ...p, elements: list };
  });
}

/* ---------- New elements ---------- */

/** Sleeves are long and narrow: artwork there runs down the sleeve. */
function narrow(box: Box): boolean {
  return box.h > box.w * 2.2;
}

/** Where new artwork goes: across the chest on the front and back, a third of the way down a sleeve. */
function startPoint(box: Box, h: number): { x: number; y: number } {
  if (narrow(box)) return { x: box.w / 2, y: Math.min(box.h / 2, Math.max(h / 2 + 10, box.h * 0.3)) };
  return { x: box.w / 2, y: Math.min(box.h / 2, Math.max(h / 2 + 20, 140)) };
}

export function newTextElement(box: Box, text: string, fontId: string, color: string): TextElement {
  const chars = Math.max(4, text.length) * (fontById(fontId).widthEm + 0.04);
  const vertical = narrow(box);
  // About two thirds of the space across (or down a sleeve), as big as a real print.
  const run = vertical ? Math.min(box.h, 360) * 0.6 : Math.min(box.w, 320) * 0.7;
  const size = Math.max(6, Math.min(run / chars, vertical ? box.w * 0.6 : 70));
  const { x, y } = startPoint(box, vertical ? run : size * 1.2);
  return {
    id: newElementId(),
    type: "text",
    text,
    fontId,
    size,
    color,
    outline: 0,
    outlineColor: "#151515",
    letterSpacing: 0.04,
    curve: 0,
    x,
    y,
    rotation: vertical ? 90 : 0,
  };
}

export function newImageElement(
  box: Box,
  asset: { assetId: string; name: string; pxW: number; pxH: number; vector: boolean },
): ImageElement {
  const aspect = asset.pxH / asset.pxW || 1;
  let w = Math.min(box.w * 0.85, 240);
  const maxH = Math.min(box.h * 0.8, 300);
  if (w * aspect > maxH) w = maxH / aspect;
  const { x, y } = startPoint(box, w * aspect);
  return { id: newElementId(), type: "image", ...asset, aspect, w, x, y, rotation: 0 };
}

export function newClipartElement(box: Box, clipartId: string, color: string): ClipartElement {
  const w = Math.max(20, Math.min(box.w * 0.75, box.h * 0.75, 130));
  const { x, y } = startPoint(box, w);
  return { id: newElementId(), type: "clipart", clipartId, w, color, x, y, rotation: 0 };
}

/** Default text for a new text layer, e.g. "CLASS OF 2027". */
export function defaultClassText(locale: "en" | "ar", now = new Date()): string {
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return locale === "ar" ? `دفعة ${year}` : `CLASS OF ${year}`;
}
