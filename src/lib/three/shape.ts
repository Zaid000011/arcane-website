import type { MockupId } from "@/lib/catalog/types";

/**
 * Garment shapes as math, in centimetres. Origin: center of the neck at
 * shoulder height (y up, x toward the wearer's left = viewer's right from the
 * front, z toward the front). Shared by the 3D meshes and print placement.
 */

export interface GarmentSpec {
  length: number;
  /** Rib waistband height (0 = plain hem). */
  band: number;
  chestHalf: number;
  hemHalf: number;
  depth: number;
  shoulderHalf: number;
  shoulderDrop: number;
  neckHalf: number;
  frontNeckDrop: number;
  backNeckDrop: number;
  sleeveLong: number;
  sleeveShort: number;
  angleLong: number;
  angleShort: number;
  armRadius: number;
  wristRadius: number;
  /** Rib cuff length (0 = plain hem). */
  cuff: number;
  hood: boolean;
  pocket: boolean;
  zipper: boolean;
  collar: "tee" | "rib" | "polo" | "none";
  snaps: boolean;
  stripes: boolean;
}

const deg = (d: number) => (d * Math.PI) / 180;

const base: Record<MockupId, GarmentSpec> = {
  tshirt: {
    length: 72, band: 0, chestHalf: 27, hemHalf: 26.5, depth: 10.5, shoulderHalf: 23.5, shoulderDrop: 4.5, neckHalf: 8.5,
    frontNeckDrop: 8, backNeckDrop: 2.5, sleeveLong: 58, sleeveShort: 21, angleLong: deg(16), angleShort: deg(34),
    armRadius: 8.8, wristRadius: 4.6, cuff: 0, hood: false, pocket: false, zipper: false, collar: "tee", snaps: false, stripes: false,
  },
  polo: {
    length: 72, band: 0, chestHalf: 27, hemHalf: 26.5, depth: 10.5, shoulderHalf: 23, shoulderDrop: 4.5, neckHalf: 8,
    frontNeckDrop: 4, backNeckDrop: 2, sleeveLong: 58, sleeveShort: 21, angleLong: deg(16), angleShort: deg(34),
    armRadius: 8.8, wristRadius: 4.6, cuff: 0, hood: false, pocket: false, zipper: false, collar: "polo", snaps: false, stripes: false,
  },
  hoodie: {
    length: 70, band: 6.5, chestHalf: 29, hemHalf: 26.5, depth: 12, shoulderHalf: 25, shoulderDrop: 5, neckHalf: 9.5,
    frontNeckDrop: 7, backNeckDrop: 2, sleeveLong: 60, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.6, wristRadius: 5.1, cuff: 7, hood: true, pocket: true, zipper: false, collar: "none", snaps: false, stripes: false,
  },
  zipHoodie: {
    length: 70, band: 6.5, chestHalf: 29, hemHalf: 26.5, depth: 12, shoulderHalf: 25, shoulderDrop: 5, neckHalf: 9.5,
    frontNeckDrop: 7, backNeckDrop: 2, sleeveLong: 60, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.6, wristRadius: 5.1, cuff: 7, hood: true, pocket: true, zipper: true, collar: "none", snaps: false, stripes: false,
  },
  sweatshirt: {
    length: 68, band: 6.5, chestHalf: 28.5, hemHalf: 26, depth: 11.5, shoulderHalf: 24.5, shoulderDrop: 5, neckHalf: 8.5,
    frontNeckDrop: 7.5, backNeckDrop: 2.5, sleeveLong: 60, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.4, wristRadius: 5, cuff: 7, hood: false, pocket: false, zipper: false, collar: "rib", snaps: false, stripes: false,
  },
  varsity: {
    length: 66, band: 7, chestHalf: 30, hemHalf: 27, depth: 12.5, shoulderHalf: 25.5, shoulderDrop: 5, neckHalf: 9,
    frontNeckDrop: 9, backNeckDrop: 2.5, sleeveLong: 61, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.8, wristRadius: 5.2, cuff: 7, hood: false, pocket: false, zipper: false, collar: "rib", snaps: true, stripes: true,
  },
};

/** Shape for a garment, adjusted for the fit (oversized and boxy are wider). */
export function specFor(mockup: MockupId, fitId: string): GarmentSpec {
  const s = { ...base[mockup] };
  if (fitId === "oversized") {
    s.chestHalf += 2.5;
    s.hemHalf += 2.5;
    s.shoulderHalf += 3;
    s.shoulderDrop += 1.5;
    s.length += 2;
    s.armRadius += 0.8;
  } else if (fitId === "boxy") {
    s.chestHalf += 2;
    s.hemHalf += 3;
    s.shoulderHalf += 2;
    s.length -= 4;
  }
  return s;
}

export const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const smoothstep = (a: number, b: number, v: number) => smooth((v - a) / (b - a));

const P = 2.6;

/** Cross-section: flat-ish front and back, rounded sides (superellipse). */
export function profile(u: number): number {
  const a = Math.min(1, Math.abs(u));
  return Math.pow(1 - Math.pow(a, P), 1 / P);
}

export function bottomY(s: GarmentSpec): number {
  return -s.length;
}

/** Half width of the body at normalized height v (0 = hem, 1 = shoulders). */
export function halfWidthAt(s: GarmentSpec, v: number): number {
  const chestV = 0.66;
  if (v < chestV) return lerp(s.hemHalf, s.chestHalf, smooth(v / chestV));
  return lerp(s.chestHalf, s.shoulderHalf, smooth((v - chestV) / (1 - chestV)));
}

export function halfDepthAt(s: GarmentSpec, v: number): number {
  return lerp(s.depth * 0.9, s.depth, smooth(v / 0.66));
}

/** Top edge: neckline in the middle, shoulder slope outside it. */
export function topY(s: GarmentSpec, x: number, side: "front" | "back"): number {
  const ax = Math.abs(x);
  if (ax <= s.neckHalf) {
    const drop = side === "front" ? s.frontNeckDrop : s.backNeckDrop;
    return -drop * Math.sqrt(Math.max(0, 1 - (ax / s.neckHalf) ** 2));
  }
  return -s.shoulderDrop * Math.min(1, (ax - s.neckHalf) / Math.max(1, s.shoulderHalf - s.neckHalf));
}

/** How open the top stays at x: the neck hole is open, the shoulders close into a seam. */
function neckOpen(s: GarmentSpec, x: number): number {
  return 0.55 * (1 - smoothstep(s.neckHalf * 0.75, s.neckHalf * 1.2, Math.abs(x)));
}

/** z of the body surface at (u, v) on one side. The top rounds over like a shoulder (quarter circle). */
export function bodyZ(s: GarmentSpec, u: number, v: number, x: number): number {
  const R = 0.11;
  const k = clamp((v - (1 - R)) / R, 0, 1);
  const round = 1 - Math.sqrt(Math.max(0, 1 - k * k));
  const taper = lerp(1, neckOpen(s, x), round);
  return profile(u) * halfDepthAt(s, v) * taper;
}

/** Body point from the (u, v) grid. */
export function bodyPoint(s: GarmentSpec, u: number, v: number, side: "front" | "back"): [number, number, number] {
  const x = u * halfWidthAt(s, v);
  const bot = bottomY(s);
  const y = bot + v * (topY(s, x, side) - bot);
  const z = bodyZ(s, u, v, x);
  return [x, y, side === "front" ? z : -z];
}

/** Surface height for any (x, y) on one side (used to lay prints on the body). */
export function surfaceZ(s: GarmentSpec, x: number, y: number, side: "front" | "back"): number {
  const bot = bottomY(s);
  const top = topY(s, x, side);
  const v = clamp((y - bot) / (top - bot), 0, 1);
  const u = clamp(x / halfWidthAt(s, v), -1, 1);
  const z = bodyZ(s, u, v, x);
  return side === "front" ? z : -z;
}

export type Vec3 = [number, number, number];

/** Point and outward normal on the body, for (x, y) in front-view coordinates. */
export function bodySample(s: GarmentSpec, x: number, y: number, side: "front" | "back"): { p: Vec3; n: Vec3 } {
  const e = 0.05;
  const z = surfaceZ(s, x, y, side);
  const dzdx = (surfaceZ(s, x + e, y, side) - surfaceZ(s, x - e, y, side)) / (2 * e);
  const dzdy = (surfaceZ(s, x, y + e, side) - surfaceZ(s, x, y - e, side)) / (2 * e);
  const sign = side === "front" ? 1 : -1;
  const n: Vec3 = [-dzdx * sign, -dzdy * sign, sign];
  const len = Math.hypot(...n);
  return { p: [x, y, z], n: [n[0] / len, n[1] / len, n[2] / len] };
}

/* ---------- Sleeves ---------- */

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface SleeveSample {
  c: Vec3;
  /** Cross-section basis: n1 faces front, b completes it. */
  n1: Vec3;
  b: Vec3;
  /** Arc length from the start of the path. */
  s: number;
}

/**
 * A sleeve follows a curve: it leaves the body sideways at the shoulder (so
 * the armhole is upright, like a real seam) and bends down along the arm.
 * Distances ("along") are measured from the shoulder seam.
 */
export interface SleevePath {
  samples: SleeveSample[];
  /** Arc length where the sleeve leaves the body. */
  shoulder: number;
  /** Visible sleeve length from the shoulder to the hem/cuff. */
  length: number;
  side: 1 | -1;
}

function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
}

/** side: +1 = wearer's left (viewer's right from the front), −1 = wearer's right. */
export function sleevePath(s: GarmentSpec, side: 1 | -1, long: boolean): SleevePath {
  const angle = long ? s.angleLong : s.angleShort;
  const cuff = long ? s.cuff : 0;
  const L = (long ? s.sleeveLong : s.sleeveShort) + cuff;
  const y0 = -s.shoulderDrop - s.armRadius * 0.82;
  const shoulderX = s.shoulderHalf + 1;
  const dir: Vec3 = norm([side * Math.sin(angle), -Math.cos(angle), 0.05]);
  const p0: Vec3 = [side * (s.shoulderHalf - 9), y0 + 1, 0];
  const p1: Vec3 = [side * (shoulderX + 3), y0, 0];
  const end: Vec3 = [side * shoulderX + dir[0] * L, y0 + dir[1] * L, dir[2] * L];
  const p2: Vec3 = [side * shoulderX + dir[0] * L * 0.35, y0 + dir[1] * L * 0.35, dir[2] * L * 0.35];
  const N = 160;
  const pts = Array.from({ length: N + 1 }, (_, i) => bezier(p0, p1, p2, end, i / N));
  const samples: SleeveSample[] = [];
  let acc = 0;
  let shoulder = 0;
  for (let i = 0; i <= N; i++) {
    const p = pts[i]!;
    if (i > 0) acc += Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1], p[2] - pts[i - 1]![2]);
    const a = pts[Math.max(0, i - 1)]!;
    const c = pts[Math.min(N, i + 1)]!;
    const t = norm([c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const b = norm(cross(t, [0, 0, 1]));
    const n1 = norm(cross(b, t));
    samples.push({ c: p, n1, b, s: acc });
    if (!shoulder && side * p[0] >= shoulderX) shoulder = acc;
  }
  // The cuff continues past the sleeve fabric.
  return { samples, shoulder, length: acc - shoulder - cuff, side };
}

/** Center and cross-section basis at a distance from the shoulder (negative = inside the body). */
export function sleeveAt(path: SleevePath, along: number): SleeveSample {
  const target = path.shoulder + along;
  const list = path.samples;
  if (target <= 0) return list[0]!;
  for (let i = 1; i < list.length; i++) {
    const b = list[i]!;
    if (b.s >= target) {
      const a = list[i - 1]!;
      const f = (target - a.s) / Math.max(1e-6, b.s - a.s);
      const mix = (x: Vec3, y: Vec3): Vec3 => [lerp(x[0], y[0], f), lerp(x[1], y[1], f), lerp(x[2], y[2], f)];
      return { c: mix(a.c, b.c), n1: norm(mix(a.n1, b.n1)), b: norm(mix(a.b, b.b)), s: target };
    }
  }
  return list[list.length - 1]!;
}

export function sleeveRadius(s: GarmentSpec, t: number, long: boolean): number {
  const end = long ? s.wristRadius : lerp(s.armRadius, s.wristRadius, 0.35) + 0.6;
  return lerp(s.armRadius, end, Math.pow(clamp(t, 0, 1), 0.85));
}

export function sleevePoint(path: SleevePath, along: number, theta: number, r: number): Vec3 {
  const f = sleeveAt(path, along);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  return [f.c[0] + r * (ct * f.n1[0] + st * f.b[0]), f.c[1] + r * (ct * f.n1[1] + st * f.b[1]), f.c[2] + r * (ct * f.n1[2] + st * f.b[2])];
}

/** Angle around the sleeve that faces front and a little outward (where sleeve prints sit). */
export function sleevePrintTheta(path: SleevePath, along: number): number {
  const f = sleeveAt(path, along);
  const want = norm([path.side * 0.55, 0, 0.85]);
  const dotN = want[0] * f.n1[0] + want[1] * f.n1[1] + want[2] * f.n1[2];
  const dotB = want[0] * f.b[0] + want[1] * f.b[1] + want[2] * f.b[2];
  return Math.atan2(dotB, dotN);
}

/* ---------- Hood ---------- */

export const HOOD_OPEN = Math.PI * 0.8;

/** Hood shell: a goes around (0 = back), b goes up (0 = neck, 1 = crown). */
export const HOOD_HEIGHT = 14;

/** A hood resting behind the neck: wide at the base, leaning back, rounded on top. */
export function hoodPoint(s: GarmentSpec, a: number, b: number): Vec3 {
  const w0 = s.neckHalf + 5;
  const d0 = s.depth * 0.8;
  const crown = Math.cos(b * (Math.PI / 2)) ** 0.55;
  const w = w0 * crown;
  const d = d0 * (0.95 + 0.5 * Math.sin(b * Math.PI)) * Math.max(crown, 0.35);
  const y = -2.5 + HOOD_HEIGHT * Math.sin((b * Math.PI) / 2);
  const lean = -13 * b * b - 2.5;
  return [w * Math.sin(a), y, -d * Math.cos(a) + lean];
}
