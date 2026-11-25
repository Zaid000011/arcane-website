import { hexToLinear, srgbToLinear } from "@/lib/closeup/surface";

/**
 * How light falls on a garment color, shared by the photos and the 3D model:
 * a white garment's brightness becomes "light", and the chosen color is lit
 * by it, so folds and knit stay as photographed.
 */

export const LIN = new Float32Array(256).map((_, v) => srgbToLinear(v / 255));
export const ENC_STEPS = 4095;
export const ENC = new Uint8ClampedArray(ENC_STEPS + 1).map((_, i) => {
  const c = i / ENC_STEPS;
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
});
export const encode = (v: number) => ENC[v <= 0 ? 0 : v >= 1 ? ENC_STEPS : (v * ENC_STEPS) | 0]!;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Keeps detail in the brightest whites instead of clipping them. */
export const shoulder = (v: number) => (v < 0.8 ? v : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)));

export const SHADE_MAX = 1.3;
export const LUT_STEPS = 1023;

/**
 * Garment color for every amount of light, as sRGB bytes. Very dark colors
 * are lifted a little and get deeper folds plus a soft sheen, the way black
 * cotton looks in a product photo instead of a flat black hole.
 */
export function garmentLut(hex: string): Uint8ClampedArray {
  const [r, g, b] = hexToLinear(hex);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const lifted = lum + 0.02 * (1 - lum) ** 6;
  const k = lum > 1e-5 ? lifted / lum : 0;
  const c = lum > 1e-5 ? [r * k, g * k, b * k] : [lifted, lifted, lifted];
  const depth = 1 + 2.6 * (1 - lifted) ** 8;
  const sheen = 0.12 * (1 - lifted) ** 4;
  const out = new Uint8ClampedArray((LUT_STEPS + 1) * 3);
  for (let i = 0; i <= LUT_STEPS; i++) {
    const e = (i / LUT_STEPS) * SHADE_MAX;
    const f = e ** depth;
    const s = sheen * Math.max(0, e - 0.85) ** 2;
    for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = encode(shoulder(c[ch]! * f + s));
  }
  return out;
}


/**
 * Recolors white-garment pixels (sRGB RGBA) in place: `white` is the
 * brightness (0–255) of well-lit fabric in the source.
 */
export function recolorPixels(px: Uint8ClampedArray, white: number, hex: string): void {
  const lut = garmentLut(hex);
  const w = LIN[Math.max(1, Math.min(255, Math.round(white)))]!;
  for (let i = 0; i < px.length; i += 4) {
    const e = (0.2126 * LIN[px[i]!]! + 0.7152 * LIN[px[i + 1]!]! + 0.0722 * LIN[px[i + 2]!]!) / w;
    const k = Math.min(LUT_STEPS, ((e / SHADE_MAX) * LUT_STEPS) | 0) * 3;
    px[i] = lut[k]!;
    px[i + 1] = lut[k + 1]!;
    px[i + 2] = lut[k + 2]!;
  }
}
