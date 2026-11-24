import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { constrainElement, measuredFor, printBoxMm, type Box, type TextMeasurement } from "./geometry";
import { newElementId, type ClipartElement, type DesignElement, type ImageElement, type TextElement } from "./types";

/** Pure operations on the artwork inside a print box. */

export function boxFor(catalog: Catalog, print: PrintSelection): Box | null {
  const area = catalog.printAreas.find((a) => a.id === print.areaId);
  return area ? printBoxMm(area, print.tier) : null;
}

function mapPrint(d: DesignSelection, areaId: string, fn: (p: PrintSelection) => PrintSelection): DesignSelection {
  return { ...d, prints: d.prints.map((p) => (p.areaId === areaId ? fn(p) : p)) };
}

export function findElement(d: DesignSelection, areaId: string, elementId: string): DesignElement | undefined {
  return d.prints.find((p) => p.areaId === areaId)?.elements?.find((e) => e.id === elementId);
}

export function addElement(catalog: Catalog, d: DesignSelection, areaId: string, el: DesignElement): DesignSelection {
  return mapPrint(d, areaId, (p) => {
    const box = boxFor(catalog, p);
    const placed = box ? constrainElement(el, box) : el;
    return { ...p, elements: [...(p.elements ?? []), placed] };
  });
}

/**
 * Updates one element and keeps it inside the box. Text is only constrained
 * when its real rendered size is known (`measurement`); otherwise the
 * designer fits it right after the browser measures it.
 */
export function updateElement(
  catalog: Catalog,
  d: DesignSelection,
  areaId: string,
  elementId: string,
  patch: Partial<DesignElement>,
  measurement?: TextMeasurement,
): DesignSelection {
  return mapPrint(d, areaId, (p) => {
    const box = boxFor(catalog, p);
    return {
      ...p,
      elements: (p.elements ?? []).map((e) => {
        if (e.id !== elementId) return e;
        const next = { ...e, ...patch, id: e.id, type: e.type } as DesignElement;
        if (!box) return next;
        if (next.type === "text") {
          const bbox = measuredFor(next, measurement);
          return bbox ? constrainElement(next, box, bbox) : next;
        }
        return constrainElement(next, box);
      }),
    };
  });
}

/**
 * Shrinks or moves text that ended up outside its print box once the browser
 * measured it. Returns the same object when nothing needed fixing.
 */
export function fitMeasuredText(catalog: Catalog, d: DesignSelection, measurements: Record<string, TextMeasurement>): DesignSelection {
  let changed = false;
  const prints = d.prints.map((p) => {
    const box = boxFor(catalog, p);
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
    return { ...p, elements };
  });
  return changed ? { ...d, prints } : d;
}

export function removeElement(d: DesignSelection, areaId: string, elementId: string): DesignSelection {
  return mapPrint(d, areaId, (p) => ({ ...p, elements: (p.elements ?? []).filter((e) => e.id !== elementId) }));
}

export function duplicateElement(catalog: Catalog, d: DesignSelection, areaId: string, elementId: string): { design: DesignSelection; newId: string | null } {
  const el = findElement(d, areaId, elementId);
  if (!el) return { design: d, newId: null };
  const copy = { ...el, id: newElementId(), x: el.x + 6, y: el.y + 6, locked: false } as DesignElement;
  return { design: addElement(catalog, d, areaId, copy), newId: copy.id };
}

/** Moves an element one step toward the front (+1) or back (−1). */
export function moveLayer(d: DesignSelection, areaId: string, elementId: string, direction: 1 | -1): DesignSelection {
  return mapPrint(d, areaId, (p) => {
    const list = [...(p.elements ?? [])];
    const i = list.findIndex((e) => e.id === elementId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return p;
    [list[i], list[j]] = [list[j]!, list[i]!];
    return { ...p, elements: list };
  });
}

/* ---------- New elements ---------- */

export function newTextElement(box: Box, text: string, fontId: string, color: string): TextElement {
  const size = Math.min(Math.max(box.h * 0.16, 6), 45, box.w / Math.max(4, text.length * 0.62));
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
    x: box.w / 2,
    y: Math.min(box.h / 2, Math.max(size, box.h * 0.3)),
    rotation: 0,
  };
}

export function newImageElement(
  box: Box,
  asset: { assetId: string; name: string; pxW: number; pxH: number; vector: boolean },
): ImageElement {
  const aspect = asset.pxH / asset.pxW || 1;
  let w = box.w * 0.8;
  if (w * aspect > box.h * 0.8) w = (box.h * 0.8) / aspect;
  return { id: newElementId(), type: "image", ...asset, aspect, w, x: box.w / 2, y: box.h / 2, rotation: 0 };
}

export function newClipartElement(box: Box, clipartId: string, color: string): ClipartElement {
  const w = Math.min(box.w, box.h) * 0.45;
  return { id: newElementId(), type: "clipart", clipartId, w, color, x: box.w / 2, y: box.h / 2, rotation: 0 };
}

/** Default text for a new text layer, e.g. "CLASS OF 2027". */
export function defaultClassText(locale: "en" | "ar", now = new Date()): string {
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return locale === "ar" ? `دفعة ${year}` : `CLASS OF ${year}`;
}
