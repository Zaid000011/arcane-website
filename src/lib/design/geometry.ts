import type { PrintArea, SizeTier } from "@/lib/catalog/types";
import type { DesignElement, ImageElement } from "./types";

/** Print box size in mm. */
export interface Box {
  w: number;
  h: number;
}

/** Element bounds before rotation, relative to the element's center point (mm). */
export interface LocalBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Print box for a size tier inside an area (cm), keeping the area's orientation. */
export function tierBoxCm(area: PrintArea, tier: SizeTier): [number, number] {
  const tierCm: Record<SizeTier, [number, number]> = { S: [10, 10], M: [21, 30], L: [30, 42], AO: [area.widthCm, area.heightCm] };
  let [tw, th] = tierCm[tier];
  if (area.widthCm > area.heightCm) [tw, th] = [th, tw];
  return [Math.min(tw, area.widthCm), Math.min(th, area.heightCm)];
}

export function printBoxMm(area: PrintArea, tier: SizeTier): Box {
  const [w, h] = tierBoxCm(area, tier);
  return { w: w * 10, h: h * 10 };
}

export function elementBBox(el: DesignElement, measured?: LocalBBox): LocalBBox {
  if (el.type === "image") {
    const h = el.w * el.aspect;
    return { x: -el.w / 2, y: -h / 2, w: el.w, h };
  }
  if (el.type === "clipart") return { x: -el.w / 2, y: -el.w / 2, w: el.w, h: el.w };
  if (measured) return measured;
  // Rough estimate until the browser has measured the real text.
  const w = Math.max(1, el.text.length) * el.size * 0.62;
  return { x: -w / 2, y: -el.size * 0.6, w, h: el.size * 1.2 };
}

/** A rendered text measurement and what it was measured for. */
export interface TextMeasurement {
  bbox: LocalBBox;
  size: number;
  shapeKey: string;
}

export function textShapeKey(el: { text: string; fontId: string; letterSpacing: number; curve: number }): string {
  return `${el.text}|${el.fontId}|${el.letterSpacing}|${el.curve}`;
}

/** Real text bounds for this element, scaled to its current size; undefined if it changed shape since measuring. */
export function measuredFor(el: DesignElement, m: TextMeasurement | undefined): LocalBBox | undefined {
  if (el.type !== "text" || !m || m.shapeKey !== textShapeKey(el) || m.size <= 0) return undefined;
  const r = el.size / m.size;
  return r === 1 ? m.bbox : { x: m.bbox.x * r, y: m.bbox.y * r, w: m.bbox.w * r, h: m.bbox.h * r };
}

/** Axis-aligned extents of a rotated bbox, relative to the element center. */
export function rotatedExtents(b: LocalBBox, rotationDeg: number) {
  const r = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const corners = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => [x! * cos - y! * sin, x! * sin + y! * cos] as const);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function scaleElement<T extends DesignElement>(el: T, s: number): T {
  if (el.type === "text") return { ...el, size: el.size * s };
  return { ...el, w: (el as Exclude<DesignElement, { type: "text" }>).w * s } as T;
}

/** The element's "size" number shown in the panel (width for images/clip-art, font size for text). */
export function elementSize(el: DesignElement): number {
  return el.type === "text" ? el.size : el.w;
}

export const MIN_SIZE_MM = 4;

const clamp = (v: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(Math.max(v, min), max));

/**
 * Keeps an element fully inside the print box: shrinks it if it's too big,
 * then moves it back inside. `measured` is the real text bounds when known.
 */
export function constrainElement<T extends DesignElement>(el: T, box: Box, measured?: LocalBBox): T {
  let next = el;
  let bbox = elementBBox(next, measured);
  let ext = rotatedExtents(bbox, next.rotation);
  const width = ext.maxX - ext.minX;
  const height = ext.maxY - ext.minY;
  const s = Math.min(1, box.w / width, box.h / height);
  if (s < 0.999) {
    next = scaleElement(next, s);
    bbox = { x: bbox.x * s, y: bbox.y * s, w: bbox.w * s, h: bbox.h * s };
    ext = rotatedExtents(bbox, next.rotation);
  }
  const x = clamp(next.x, -ext.minX, box.w - ext.maxX);
  const y = clamp(next.y, -ext.minY, box.h - ext.maxY);
  return x === next.x && y === next.y ? next : { ...next, x, y };
}

/** Scales a whole layout when the print box changes size (e.g. Medium → Small). */
export function rescaleElements(elements: DesignElement[], from: Box, to: Box): DesignElement[] {
  if (from.w === to.w && from.h === to.h) return elements;
  const s = Math.min(to.w / from.w, to.h / from.h);
  return elements.map((el) => {
    const scaled = scaleElement(el, s);
    return constrainElement({ ...scaled, x: to.w / 2 + (el.x - from.w / 2) * s, y: el.y * s }, to);
  });
}

/** Snaps a value to a target when within the threshold. */
export function snap(value: number, target: number, threshold: number): { value: number; snapped: boolean } {
  return Math.abs(value - target) <= threshold ? { value: target, snapped: true } : { value, snapped: false };
}

/** Effective print resolution of an image at its printed width. Vectors are unlimited. */
export function imageDpi(el: ImageElement): number {
  if (el.vector) return Number.POSITIVE_INFINITY;
  return Math.round(el.pxW / (el.w / 25.4));
}

export const DPI_WARN = 150;
export const DPI_MIN = 100;

export type DpiLevel = "great" | "ok" | "low" | "tooLow";

export function dpiLevel(dpi: number): DpiLevel {
  if (dpi >= 300) return "great";
  if (dpi >= DPI_WARN) return "ok";
  if (dpi >= DPI_MIN) return "low";
  return "tooLow";
}
