import type { MockupId, Sleeve } from "@/lib/catalog/types";
import { placementOf } from "@/lib/design/placement";
import type { RectPlacement } from "@/lib/design/sides";
import { STATIC_ROOT } from "@/lib/site-mode";
import { PHOTO_DATA } from "./photo-data";
import { FULL_TRIMS, trimsKey, type GarmentTrims } from "@/lib/design/options";
import { siteConfig } from "@/config/site";

/**
 * Real-looking garment photos: one white garment photographed from the front
 * and from the back for every garment and sleeve length. The site recolors
 * them and lays the customer's prints on them (see compose.ts). This file says
 * where everything goes on each photo, in the photo's own pixels.
 */

export type Pt = [number, number];

/** One sleeve's outline as the front photo shows it. */
export interface PhotoSleeve {
  /** Top outside corner, at the shoulder seam. */
  p0: Pt;
  /** Top inside corner, where the sleeve leaves the body. */
  pin: Pt;
  /** Inside corner of the cuff or hem. */
  p2: Pt;
  /** Outside corner of the cuff or hem. */
  p1: Pt;
}

export interface PhotoData {
  /** Pixel size of the original square photo; every point here is in its pixels. */
  size: number;
  /** The garment's outline: left, top, right, bottom. */
  box: [number, number, number, number];
  /** Pixels per cm on the garment's front (or back) panel. */
  px: number;
  /** Middle of the neckline seam, where the collar (or hood) meets the body. */
  neck: Pt;
  /** Brightness (0–255) of well-lit fabric; shading is measured against it. */
  white: number;
  /** Inside back neck, where a neck label shows through the neck opening (front photos). */
  label?: Pt;
  /** Top middle of the hood print (back photos of hoodies). */
  hood?: Pt;
  /** Drawstrings hanging over the chest, each from its eyelet to its tip. */
  strings?: [Pt, Pt][];
  /** The wearer's left and right sleeves (front photos). */
  sleeves?: { left: PhotoSleeve; right: PhotoSleeve };
}

export type PhotoView = "front" | "back";

export interface GarmentPhoto extends PhotoData {
  name: string;
  mockup: MockupId;
  sleeve: Sleeve;
  view: PhotoView;
}

/** Sleeve prints show on the front photo; everything else on its own side. */
export function photoViewFor(view: string): PhotoView {
  return view === "back" ? "back" : "front";
}

export function garmentPhoto(mockup: MockupId, sleeve: Sleeve, view: PhotoView, trims: GarmentTrims = FULL_TRIMS): GarmentPhoto | null {
  const name = `${mockup}-${sleeve}${trimsKey(trims)}-${view}`;
  const data = PHOTO_DATA[name];
  return data ? { ...data, name, mockup, sleeve, view } : null;
}

/**
 * The trims to look for photos with: the garment's own, or (while the 3D view is off) the
 * standard ones when there are no photos without cuffs or waistband yet.
 */
export function photoTrimsFor(mockup: MockupId, sleeve: Sleeve, trims: GarmentTrims): GarmentTrims {
  if (siteConfig.show3d || hasPhotos(mockup, sleeve, trims)) return trims;
  return FULL_TRIMS;
}

/** True when this garment has both a front and a back photo. */
export function hasPhotos(mockup: MockupId, sleeve: Sleeve, trims: GarmentTrims = FULL_TRIMS): boolean {
  const base = `${mockup}-${sleeve}${trimsKey(trims)}`;
  return Boolean(PHOTO_DATA[`${base}-front`] && PHOTO_DATA[`${base}-back`]);
}

/** The photo file: the big one for the designer, a small one for little pictures. */
export function photoUrl(photo: GarmentPhoto, small: boolean): string {
  return `${STATIC_ROOT}/mockups/${small ? "720/" : ""}${photo.name}.webp`;
}

/**
 * A print box laid on a photo. Artwork millimetres (x right, y down from the
 * top-left corner) map to photo pixels as origin + x·ax + y·ay.
 */
export interface PhotoQuad {
  origin: Pt;
  /** Photo pixels moved per mm along the artwork's width. */
  ax: Pt;
  /** Photo pixels moved per mm down the artwork. */
  ay: Pt;
  wMm: number;
  hMm: number;
  /** Only show the print inside this outline (a sleeve). */
  clip?: Pt[];
  /** Drawstrings that hang over the print: lines with a half-width in pixels. */
  over?: { a: Pt; b: Pt; r: number }[];
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const unit = (a: Pt): Pt => mul(a, 1 / (Math.hypot(a[0], a[1]) || 1));

/** Width of the outline along direction `dir` through point `p` (where a ray both ways crosses it). */
function chord(poly: Pt[], p: Pt, dir: Pt): number {
  const hits: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const e = sub(b, a);
    const den = dir[0] * e[1] - dir[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const ap = sub(a, p);
    const t = (ap[0] * e[1] - ap[1] * e[0]) / den;
    const s = (ap[0] * dir[1] - ap[1] * dir[0]) / den;
    if (s >= 0 && s <= 1) hits.push(t);
  }
  if (hits.length < 2) return 0;
  return Math.max(...hits) - Math.min(...hits);
}

function box(cx: number, top: number, wCm: number, hCm: number, px: number): PhotoQuad {
  const k = px / 10;
  return { origin: [cx - (wCm / 2) * px, top], ax: [k, 0], ay: [0, k], wMm: wCm * 10, hMm: hCm * 10 };
}

/**
 * Where a print area's box (wCm × hCm) sits on a photo, or null when the photo
 * doesn't show it (a back print on the front photo). Uses the same
 * measurements as the 3D garment and the workshop sheet.
 */
export function placeOnPhoto(photo: GarmentPhoto, areaId: string, wCm: number, hCm: number): PhotoQuad | null {
  const p = placementOf(areaId, photo.sleeve);
  if (!p) return null;
  const px = photo.px;
  switch (p.from) {
    case "frontNeck": {
      if (photo.view !== "front") return null;
      // The wearer's left is on the viewer's right.
      const q = box(photo.neck[0] + p.sideCm * px, photo.neck[1] + p.downCm * px, wCm, hCm, px);
      if (photo.strings) q.over = photo.strings.map(([a, b]) => ({ a, b, r: photo.size * 0.0085 }));
      return q;
    }
    case "backNeck":
      if (photo.view !== "back") return null;
      return box(photo.neck[0] - p.sideCm * px, photo.neck[1] + p.downCm * px, wCm, hCm, px);
    case "hoodSeam":
      if (photo.view !== "back" || !photo.hood) return null;
      return box(photo.hood[0], photo.hood[1], wCm, hCm, px);
    case "shoulder":
      return sleeveQuad(photo, p.sleeve === 1 ? "left" : "right", p.downCm, 0, wCm, hCm);
  }
}

/**
 * A box on a sleeve of the front photo: its top `downCm` down the sleeve, its
 * middle `acrossCm` to the viewer's right of the sleeve's middle line.
 */
function sleeveQuad(photo: GarmentPhoto, which: "left" | "right", downCm: number, acrossCm: number, wCm: number, hCm: number): PhotoQuad | null {
  const s = photo.view === "front" ? photo.sleeves?.[which] : undefined;
  if (!s) return null;
  const px = photo.px;
  const clip = [s.p0, s.pin, s.p2, s.p1];
  const m0 = mid(s.p0, s.pin);
  const m1 = mid(s.p1, s.p2);
  const down = unit(sub(m1, m0));
  // Long sleeves are measured from the shoulder seam; short ones from where the sleeve starts showing.
  const start = photo.sleeve === "long" ? add(m0, mul(down, dot(sub(s.p0, m0), down))) : m0;
  // The artwork's right points to the viewer's right, its top toward the shoulder.
  const right: Pt = [down[1], -down[0]];
  // A sleeve curves away, so it shows narrower than it is: squeeze wide prints to fit.
  const middle = add(start, mul(down, (downCm + hCm / 2) * px));
  const fit = chord(clip, middle, right);
  const squeeze = Math.min(1, (0.82 * fit) / (wCm * px || 1));
  const topCenter = add(add(start, mul(down, downCm * px)), mul(right, acrossCm * px * squeeze));
  const ax = mul(right, (px / 10) * squeeze);
  const ay = mul(down, px / 10);
  return { origin: sub(topCenter, mul(ax, (wCm * 10) / 2)), ax, ay, wMm: wCm * 10, hMm: hCm * 10, clip };
}

/**
 * Where a free print sits on a photo (its place on its side, from placeRect
 * in src/lib/design/sides.ts), or null when this photo doesn't show that side.
 */
export function placePrintOnPhoto(photo: GarmentPhoto, rp: RectPlacement): PhotoQuad | null {
  const px = photo.px;
  switch (rp.side) {
    case "front": {
      if (photo.view !== "front") return null;
      const q = box(photo.neck[0] + rp.cxCm * px, photo.neck[1] + rp.topCm * px, rp.wCm, rp.hCm, px);
      if (photo.strings) q.over = photo.strings.map(([a, b]) => ({ a, b, r: photo.size * 0.0085 }));
      return q;
    }
    case "back":
      if (photo.view !== "back") return null;
      return box(photo.neck[0] + rp.cxCm * px, photo.neck[1] + rp.topCm * px, rp.wCm, rp.hCm, px);
    case "hood": {
      if (photo.view !== "back" || !photo.hood) return null;
      // The hood mark is the top middle of a print starting 11 cm above the neck seam.
      const seamY = photo.hood[1] + 11 * px;
      return box(photo.hood[0] + rp.cxCm * px, seamY - rp.topCm * px, rp.wCm, rp.hCm, px);
    }
    case "leftSleeve":
    case "rightSleeve":
      return sleeveQuad(photo, rp.side === "leftSleeve" ? "left" : "right", rp.topCm, rp.cxCm, rp.wCm, rp.hCm);
  }
}

/** The small woven label inside the back neck, as seen through the neck opening (front photos). */
export function labelOnPhoto(photo: GarmentPhoto): PhotoQuad | null {
  if (photo.view !== "front" || !photo.label) return null;
  return box(photo.label[0], photo.label[1] - photo.px, 5, 2, photo.px);
}

/** The middle of a placed box, in photo pixels. */
export function quadCenter(q: PhotoQuad): Pt {
  return add(q.origin, add(mul(q.ax, q.wMm / 2), mul(q.ay, q.hMm / 2)));
}

/** The four corners of a placed box, in photo pixels. */
export function quadCorners(q: PhotoQuad): Pt[] {
  const w = mul(q.ax, q.wMm);
  const h = mul(q.ay, q.hMm);
  return [q.origin, add(q.origin, w), add(add(q.origin, w), h), add(q.origin, h)];
}
