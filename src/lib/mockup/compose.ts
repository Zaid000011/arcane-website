import type { Catalog } from "@/lib/catalog/types";
import { withFreePrints } from "@/lib/design/logic";
import { useMeasureStore } from "@/lib/design/measure-store";
import { isPrintSide, panelBox, placeRect, printRenderRect } from "@/lib/design/sides";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import { drawNamesList, drawNeckLabel, drawPersonalText, drawPrintRect, placeholderCanvas, type PatchStyle } from "@/lib/three/print-canvas";
import { clamp01, encode, garmentLut, LIN, LUT_STEPS, SHADE_MAX, shoulder, smoothstep } from "./shade";
import { garmentPhoto, labelOnPhoto, photoUrl, placeOnPhoto, placePrintOnPhoto, type GarmentPhoto, type PhotoQuad, type PhotoView, type Pt } from "./photos";
import { bodyHex, trimsOf } from "@/lib/design/options";

/**
 * Draws a design on a real garment photo, in the browser:
 *
 * 1. The white garment photo becomes a map of light and shadow (how bright
 *    each spot is compared with well-lit fabric).
 * 2. That light falls on the chosen color, so folds, seams and knit texture
 *    stay exactly as photographed.
 * 3. Prints are laid on with the same light, bent slightly by the folds, and
 *    finished the way each method looks: ink soaks into the knit, vinyl
 *    shines, puff and embroidery stand up and cast a soft shadow.
 */

/** Where the photo sits on the canvas: canvas pixel = photo pixel × scale + (dx, dy). */
export interface PhotoLayout {
  scale: number;
  dx: number;
  dy: number;
}

export interface ComposeOptions {
  catalog: Catalog;
  design: DesignSelection;
  view: PhotoView;
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  samples?: PrintSamples;
  /** Dashed boxes where prints will go (while editing). */
  placeholders?: boolean;
  /** Empty space around the garment, as shares of the canvas. */
  pad?: { top: number; bottom: number; side: number };
}

export interface Composed {
  image: ImageData;
  layout: PhotoLayout;
  photo: GarmentPhoto;
}

/* ---------- loading ---------- */

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadPhotoImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Couldn't load ${url}`));
      img.src = url;
    });
    p.catch(() => imageCache.delete(url));
    imageCache.set(url, p);
  }
  return p;
}

/* ---------- the garment: light map and recolor ---------- */

interface Base {
  width: number;
  height: number;
  layout: PhotoLayout;
  /** The recolored garment, ready to draw. */
  rgba: Uint8ClampedArray;
  /** Light on each pixel: 1 = well-lit fabric, lower in shadow. */
  shade: Float32Array;
  /** The same, blurred past the knit texture: folds only. */
  smooth: Float32Array;
}

const baseCache = new Map<string, Promise<Base>>();

function fitLayout(photo: GarmentPhoto, width: number, height: number, pad: { top: number; bottom: number; side: number }): PhotoLayout {
  const [x0, y0, x1, y1] = photo.box;
  const availW = width * (1 - 2 * pad.side);
  const availH = height * (1 - pad.top - pad.bottom);
  const scale = Math.min(availW / (x1 - x0), availH / (y1 - y0));
  return {
    scale,
    dx: (width - (x1 - x0) * scale) / 2 - x0 * scale,
    dy: height * pad.top + (availH - (y1 - y0) * scale) / 2 - y0 * scale,
  };
}

/** Box blur of `v` weighted by `w` (so the background doesn't darken the edges). */
function weightedBlur(v: Float32Array, w: Float32Array, width: number, height: number, r: number): Float32Array {
  const pass = (src: Float32Array, wt: Float32Array, horizontal: boolean) => {
    const outV = new Float32Array(src.length);
    const outW = new Float32Array(src.length);
    const lines = horizontal ? height : width;
    const len = horizontal ? width : height;
    const step = horizontal ? 1 : width;
    for (let l = 0; l < lines; l++) {
      const start = horizontal ? l * width : l;
      let sv = 0;
      let sw = 0;
      for (let i = -r; i <= r; i++) {
        const k = Math.min(len - 1, Math.max(0, i));
        sv += src[start + k * step]! * wt[start + k * step]!;
        sw += wt[start + k * step]!;
      }
      for (let i = 0; i < len; i++) {
        const idx = start + i * step;
        outV[idx] = sv;
        outW[idx] = sw;
        const addK = Math.min(len - 1, i + r + 1);
        const subK = Math.max(0, i - r);
        sv += src[start + addK * step]! * wt[start + addK * step]! - src[start + subK * step]! * wt[start + subK * step]!;
        sw += wt[start + addK * step]! - wt[start + subK * step]!;
      }
    }
    for (let i = 0; i < src.length; i++) outV[i] = outW[i]! > 1e-6 ? outV[i]! / outW[i]! : 0;
    return { v: outV, w: outW };
  };
  const h = pass(v, w, true);
  // The weights of the first pass carry over, so heavily covered pixels count more.
  const ones = new Float32Array(w.length);
  for (let i = 0; i < w.length; i++) ones[i] = h.w[i]! > 1e-6 ? 1 : 0;
  return pass(h.v, ones, false).v;
}

async function buildBase(photo: GarmentPhoto, color: string, width: number, height: number, pad: ComposeOptions["pad"] & object): Promise<Base> {
  const layout = fitLayout(photo, width, height, pad);
  // The small photo is enough when it isn't enlarged much.
  const small = photo.size * layout.scale <= 720 * 1.12;
  const img = await loadPhotoImage(photoUrl(photo, small));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, layout.dx, layout.dy, photo.size * layout.scale, photo.size * layout.scale);
  const rgba = ctx.getImageData(0, 0, width, height).data;

  const n = width * height;
  const shade = new Float32Array(n);
  const weight = new Float32Array(n);
  const white = LIN[photo.white]!;
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3]!;
    if (!a) continue;
    shade[i] = (0.2126 * LIN[rgba[i * 4]!]! + 0.7152 * LIN[rgba[i * 4 + 1]!]! + 0.0722 * LIN[rgba[i * 4 + 2]!]!) / white;
    weight[i] = a / 255;
  }
  const smooth = weightedBlur(shade, weight, width, height, Math.max(1, Math.round(photo.px * layout.scale * 0.22)));

  const lut = garmentLut(color);
  for (let i = 0; i < n; i++) {
    if (!rgba[i * 4 + 3]) continue;
    const k = Math.min(LUT_STEPS, ((shade[i]! / SHADE_MAX) * LUT_STEPS) | 0) * 3;
    rgba[i * 4] = lut[k]!;
    rgba[i * 4 + 1] = lut[k + 1]!;
    rgba[i * 4 + 2] = lut[k + 2]!;
  }
  return { width, height, layout, rgba, shade, smooth };
}

function getBase(photo: GarmentPhoto, color: string, width: number, height: number, pad: ComposeOptions["pad"] & object): Promise<Base> {
  const key = `${photo.name}|${color}|${width}x${height}|${pad.top},${pad.bottom},${pad.side}`;
  let p = baseCache.get(key);
  if (p) {
    baseCache.delete(key);
  } else {
    p = buildBase(photo, color, width, height, pad);
    p.catch(() => baseCache.delete(key));
  }
  baseCache.set(key, p);
  while (baseCache.size > 4) baseCache.delete(baseCache.keys().next().value!);
  return p;
}

/* ---------- prints ---------- */

/** How a print method looks in a photo. */
interface PhotoLook {
  /** 0 = the ink soaks in and the knit shows through, 1 = it covers the knit. */
  cover: number;
  /** Shine on the brightest parts. */
  gloss: number;
  /** How far it stands up (bevelled edges and a soft shadow). */
  raise: number;
  thread?: boolean;
  glitter?: boolean;
  fuzz?: boolean;
  patch?: PatchStyle;
}

const LOOKS: Record<string, PhotoLook> = {
  dtf: { cover: 0.75, gloss: 0.3, raise: 0.08 },
  dtg: { cover: 0, gloss: 0, raise: 0 },
  screen: { cover: 0.65, gloss: 0.1, raise: 0.06 },
  puff: { cover: 1, gloss: 0.05, raise: 0.9 },
  embroidery: { cover: 1, gloss: 0.35, raise: 0.35, thread: true },
  embroidery3d: { cover: 1, gloss: 0.35, raise: 0.85, thread: true },
  sublimation: { cover: 0, gloss: 0, raise: 0 },
  vinyl: { cover: 1, gloss: 0.75, raise: 0.1 },
  vinylSpecial: { cover: 1, gloss: 1, raise: 0.1, glitter: true },
  wovenPatch: { cover: 1, gloss: 0.08, raise: 0.5, patch: "woven" },
  chenillePatch: { cover: 1, gloss: 0, raise: 0.75, fuzz: true, patch: "chenille" },
};
const NECK_LABEL: PhotoLook = { cover: 1, gloss: 0.05, raise: 0.25 };

function photoLook(methodId: string): PhotoLook {
  return LOOKS[methodId] ?? LOOKS.dtf!;
}

interface Layer {
  quad: PhotoQuad;
  art: HTMLCanvasElement;
  /** null = a flat guide (placeholder), not a real print. */
  look: PhotoLook | null;
}

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function insidePolygon(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(x: number, y: number, a: Pt, b: Pt): number {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const t = clamp01(((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1));
  return Math.hypot(x - (a[0] + ex * t), y - (a[1] + ey * t));
}

/** Simple box blur of a small buffer (for raised prints' edges and shadows). */
function blurSmall(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[y * w + Math.min(w - 1, Math.max(0, i))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s * norm;
      s += src[y * w + Math.min(w - 1, x + r + 1)]! - src[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[Math.min(h - 1, Math.max(0, i)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s * norm;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

/** Lays one print onto the garment pixels in `out`. */
function drawLayer(base: Base, out: Uint8ClampedArray, layer: Layer, pxPerCm: number) {
  const { layout, width: W, height: H, shade, smooth } = base;
  const { quad, look } = layer;
  const s = layout.scale;
  const o: Pt = [quad.origin[0] * s + layout.dx, quad.origin[1] * s + layout.dy];
  const ax: Pt = [quad.ax[0] * s, quad.ax[1] * s];
  const ay: Pt = [quad.ay[0] * s, quad.ay[1] * s];
  const det = ax[0] * ay[1] - ay[0] * ax[1];
  if (Math.abs(det) < 1e-9) return;
  const toCanvas = (p: Pt): Pt => [p[0] * s + layout.dx, p[1] * s + layout.dy];
  const clip = quad.clip?.map(toCanvas);
  const over = quad.over?.map((l) => ({ a: toCanvas(l.a), b: toCanvas(l.b), r: l.r * s }));
  const cmPx = pxPerCm * s;

  // Artwork resampled to about two of its pixels per canvas pixel.
  const perMm = Math.max(Math.hypot(ax[0], ax[1]), Math.hypot(ay[0], ay[1]));
  const res = Math.min(layer.art.width / quad.wMm, Math.max(0.5, perMm * 2));
  const aw = Math.max(2, Math.ceil(quad.wMm * res));
  const ah = Math.max(2, Math.ceil(quad.hMm * res));
  const artCanvas = document.createElement("canvas");
  artCanvas.width = aw;
  artCanvas.height = ah;
  const actx = artCanvas.getContext("2d", { willReadFrequently: true })!;
  actx.imageSmoothingQuality = "high";
  actx.drawImage(layer.art, 0, 0, aw, ah);
  const art = actx.getImageData(0, 0, aw, ah).data;

  // The canvas area the print can touch, with room for its shadow.
  const corners: Pt[] = [o, [o[0] + ax[0] * quad.wMm, o[1] + ax[1] * quad.wMm], [o[0] + ax[0] * quad.wMm + ay[0] * quad.hMm, o[1] + ax[1] * quad.wMm + ay[1] * quad.hMm], [o[0] + ay[0] * quad.hMm, o[1] + ay[1] * quad.hMm]];
  const raise = look?.raise ?? 0;
  const margin = raise > 0 ? Math.ceil(cmPx * 0.5) + 2 : 1;
  const bx0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))) - margin);
  const by0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))) - margin);
  const bx1 = Math.min(W, Math.ceil(Math.max(...corners.map((c) => c[0]))) + margin);
  const by1 = Math.min(H, Math.ceil(Math.max(...corners.map((c) => c[1]))) + margin);
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  if (bw <= 0 || bh <= 0) return;

  const cover = new Float32Array(bw * bh);
  const cr = new Float32Array(bw * bh);
  const cg = new Float32Array(bw * bh);
  const cb = new Float32Array(bw * bh);
  const um = new Float32Array(bw * bh);
  const vm = new Float32Array(bw * bh);
  // Folds bend the print a little: push it along the slope of the light.
  const bend = cmPx * 4;
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const i = y * W + x;
      const garment = out[i * 4 + 3]! / 255;
      if (!garment || (clip && !insidePolygon(clip, x + 0.5, y + 0.5))) continue;
      let px = x + 0.5;
      let py = y + 0.5;
      if (look && x > 0 && y > 0 && x < W - 1 && y < H - 1) {
        px -= (smooth[i + 1]! - smooth[i - 1]!) * bend;
        py -= (smooth[i + W]! - smooth[i - W]!) * bend;
      }
      const dx = px - o[0];
      const dy = py - o[1];
      const u = (dx * ay[1] - dy * ay[0]) / det;
      const v = (dy * ax[0] - dx * ax[1]) / det;
      if (u < 0 || v < 0 || u > quad.wMm || v > quad.hMm) continue;
      // Bilinear sample, weighting colors by coverage so edges don't go dark.
      const fx = u * res - 0.5;
      const fy = v * res - 0.5;
      const x0 = Math.max(0, Math.min(aw - 1, Math.floor(fx)));
      const y0 = Math.max(0, Math.min(ah - 1, Math.floor(fy)));
      const x1 = Math.min(aw - 1, x0 + 1);
      const y1 = Math.min(ah - 1, y0 + 1);
      const tx = clamp01(fx - x0);
      const ty = clamp01(fy - y0);
      let sa = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      const take = (ix: number, iy: number, wgt: number) => {
        const k = (iy * aw + ix) * 4;
        const a = (art[k + 3]! / 255) * wgt;
        sa += a;
        sr += LIN[art[k]!]! * a;
        sg += LIN[art[k + 1]!]! * a;
        sb += LIN[art[k + 2]!]! * a;
      };
      take(x0, y0, (1 - tx) * (1 - ty));
      take(x1, y0, tx * (1 - ty));
      take(x0, y1, (1 - tx) * ty);
      take(x1, y1, tx * ty);
      if (sa < 1e-4) continue;
      let a = sa * garment;
      if (over) for (const l of over) a *= clamp01((segmentDistance(x + 0.5, y + 0.5, l.a, l.b) - l.r) / 1.5 + 0.5);
      const j = (y - by0) * bw + (x - bx0);
      cover[j] = a;
      cr[j] = sr / sa;
      cg[j] = sg / sa;
      cb[j] = sb / sa;
      um[j] = u;
      vm[j] = v;
    }
  }

  // Raised prints: a softened copy of the coverage gives bevelled edges and the shadow below them.
  const rb = Math.max(1, Math.round(cmPx * 0.12));
  const soft = raise > 0 ? blurSmall(cover, bw, bh, rb) : null;
  const shadowDx = Math.round(rb * 0.9);
  const shadowDy = Math.round(rb * 1.4);

  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) {
      const i = y * W + x;
      const j = (y - by0) * bw + (x - bx0);
      const a = cover[j]!;
      const k = i * 4;
      if (!out[k + 3]) continue;
      let br = LIN[out[k]!]!;
      let bg = LIN[out[k + 1]!]!;
      let bb = LIN[out[k + 2]!]!;
      if (soft) {
        const sx = x - bx0 - shadowDx;
        const sy = y - by0 - shadowDy;
        const cast = sx >= 0 && sy >= 0 && sx < bw && sy < bh ? soft[sy * bw + sx]! : 0;
        const dim = 1 - raise * 0.32 * cast * (1 - a);
        br *= dim;
        bg *= dim;
        bb *= dim;
      }
      if (a <= 0) {
        if (soft) {
          out[k] = encode(br);
          out[k + 1] = encode(bg);
          out[k + 2] = encode(bb);
        }
        continue;
      }
      let r = cr[j]!;
      let g = cg[j]!;
      let b = cb[j]!;
      if (look) {
        const e = shade[i]!;
        const es = smooth[i]!;
        let light = e + (es - e) * look.cover;
        if (soft) {
          const gx = (soft[Math.min(bw * bh - 1, j + 1)]! - soft[Math.max(0, j - 1)]!) * rb;
          const gy = (soft[Math.min(bw * bh - 1, j + bw)]! - soft[Math.max(0, j - bw)]!) * rb;
          light *= 1 + raise * 0.45 * (gx * 0.6 + gy * 0.8);
        }
        if (look.thread) light *= 0.86 + 0.14 * Math.sin(((um[j]! + vm[j]!) * 0.7071 * Math.PI * 2) / 2.2);
        if (look.fuzz) light *= 0.86 + 0.28 * (hash(x, y) - 0.5);
        if (look.glitter) {
          const m = 0.45 + 0.75 * es ** 3;
          r *= m;
          g *= m;
          b *= m;
          if (hash(x, y) > 0.965) light += 0.55 * es;
        }
        const spark = look.gloss * 0.22 * smoothstep(0.92, 1.15, es);
        r = r * light + spark;
        g = g * light + spark;
        b = b * light + spark;
      }
      out[k] = encode(shoulder(br + (r - br) * a));
      out[k + 1] = encode(shoulder(bg + (g - bg) * a));
      out[k + 2] = encode(shoulder(bb + (b - bb) * a));
    }
  }
}

/* ---------- putting it together ---------- */

const DEFAULT_PAD = { top: 0.05, bottom: 0.05, side: 0.05 };

/** The design drawn on its garment photo, or null when there's no photo for it. */
export async function composeGarmentPhoto(o: ComposeOptions): Promise<Composed | null> {
  const { catalog } = o;
  const design = withFreePrints(catalog, o.design);
  const product = catalog.products.find((p) => p.id === design.productId) ?? catalog.products[0]!;
  const photo = garmentPhoto(product.mockup, design.sleeve, o.view, trimsOf(product, design));
  if (!photo || o.width < 2 || o.height < 2) return null;
  const color = bodyHex(catalog, design);
  const pad = o.pad ?? DEFAULT_PAD;

  const basePromise = getBase(photo, color, Math.round(o.width), Math.round(o.height), pad);
  const layers: Layer[] = [];
  const measurements = useMeasureStore.getState().measurements;
  for (const print of design.prints) {
    if (!isPrintSide(print.areaId)) continue;
    const look = photoLook(print.methodId);
    const elements = print.elements ?? [];
    const rect = printRenderRect(elements, panelBox(product.mockup, design.sleeve, print.areaId), measurements, look.patch ? 6 : 2);
    const quad = placePrintOnPhoto(photo, placeRect(product.mockup, design.sleeve, print.areaId, rect));
    if (!quad) continue;
    if (elements.length || look.patch) layers.push({ quad, look, art: await drawPrintRect(elements, rect, look.patch ?? null) });
    else if (o.placeholders) layers.push({ quad, look: null, art: placeholderCanvas(rect.w, rect.h) });
  }

  const p = design.personalization;
  const personal = async (areaId: string | undefined, draw: (w: number, h: number) => Promise<HTMLCanvasElement>, methodId: string) => {
    const area = areaId ? catalog.printAreas.find((a) => a.id === areaId) : undefined;
    const quad = area ? placeOnPhoto(photo, area.id, area.widthCm, area.heightCm) : null;
    if (!area || !quad) return;
    layers.push({ quad, look: photoLook(methodId), art: await draw(area.widthCm * 10, area.heightCm * 10) });
  };
  if (p.namesList && p.namesListStyle) await personal(p.namesListStyle.areaId, (w, h) => drawNamesList(p.namesListNames ?? [], p.namesListStyle!, w, h), "screen");
  if (p.numbers && p.numberStyle) await personal(p.numberStyle.areaId, (w, h) => drawPersonalText(o.samples?.number || "10", p.numberStyle!, w, h), "vinyl");
  if (p.names && p.nameStyle) await personal(p.nameStyle.areaId, (w, h) => drawPersonalText(o.samples?.name || "YOUR NAME", p.nameStyle!, w, h), "vinyl");
  if (p.neckLabel) {
    const quad = labelOnPhoto(photo);
    if (quad) layers.push({ quad, look: NECK_LABEL, art: drawNeckLabel(p.neckLabelText ?? "") });
  }

  const base = await basePromise;
  const pixels = new Uint8ClampedArray(base.rgba);
  for (const layer of layers) drawLayer(base, pixels, layer, photo.px);
  return { image: new ImageData(pixels, base.width, base.height), layout: base.layout, photo };
}
