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
  /** How much the fabric folds and hangs (1 = soft jersey; stiff melton folds less). */
  drape: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

const base: Record<MockupId, GarmentSpec> = {
  tshirt: {
    length: 72, band: 0, chestHalf: 27, hemHalf: 26.5, depth: 10.5, shoulderHalf: 23.5, shoulderDrop: 4.5, neckHalf: 8.5,
    frontNeckDrop: 8, backNeckDrop: 2.5, sleeveLong: 58, sleeveShort: 21, angleLong: deg(16), angleShort: deg(34),
    armRadius: 8.8, wristRadius: 4.6, cuff: 0, hood: false, pocket: false, zipper: false, collar: "tee", snaps: false, stripes: false, drape: 1,
  },
  polo: {
    length: 72, band: 0, chestHalf: 27, hemHalf: 26.5, depth: 10.5, shoulderHalf: 23, shoulderDrop: 4.5, neckHalf: 8,
    frontNeckDrop: 4, backNeckDrop: 2, sleeveLong: 58, sleeveShort: 21, angleLong: deg(16), angleShort: deg(34),
    armRadius: 8.8, wristRadius: 4.6, cuff: 0, hood: false, pocket: false, zipper: false, collar: "polo", snaps: false, stripes: false, drape: 0.85,
  },
  hoodie: {
    length: 70, band: 6.5, chestHalf: 29, hemHalf: 26.5, depth: 12, shoulderHalf: 25, shoulderDrop: 5, neckHalf: 9.5,
    frontNeckDrop: 7, backNeckDrop: 2, sleeveLong: 60, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.6, wristRadius: 5.1, cuff: 7, hood: true, pocket: true, zipper: false, collar: "none", snaps: false, stripes: false, drape: 0.95,
  },
  zipHoodie: {
    length: 70, band: 6.5, chestHalf: 29, hemHalf: 26.5, depth: 12, shoulderHalf: 25, shoulderDrop: 5, neckHalf: 9.5,
    frontNeckDrop: 7, backNeckDrop: 2, sleeveLong: 60, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.6, wristRadius: 5.1, cuff: 7, hood: true, pocket: true, zipper: true, collar: "none", snaps: false, stripes: false, drape: 0.9,
  },
  sweatshirt: {
    length: 68, band: 6.5, chestHalf: 28.5, hemHalf: 26, depth: 11.5, shoulderHalf: 24.5, shoulderDrop: 5, neckHalf: 8.5,
    frontNeckDrop: 7.5, backNeckDrop: 2.5, sleeveLong: 60, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.4, wristRadius: 5, cuff: 7, hood: false, pocket: false, zipper: false, collar: "rib", snaps: false, stripes: false, drape: 0.95,
  },
  varsity: {
    length: 66, band: 7, chestHalf: 30, hemHalf: 27, depth: 12.5, shoulderHalf: 25.5, shoulderDrop: 5, neckHalf: 9,
    frontNeckDrop: 9, backNeckDrop: 2.5, sleeveLong: 61, sleeveShort: 22, angleLong: deg(15), angleShort: deg(32),
    armRadius: 9.8, wristRadius: 5.2, cuff: 7, hood: false, pocket: false, zipper: false, collar: "rib", snaps: true, stripes: true, drape: 0.45,
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
  const z = bodyZ(s, u, v, x) + bodyFold(s, x, y, side);
  return [x, y, side === "front" ? z : -z];
}

/* ---------- Folds ---------- */

function hash(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth random hills, 0–1, about one per unit. */
export function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Soft folds where real fabric gathers and hangs, in cm along the outward
 * normal. Prints use the same surface, so they bend with the folds.
 */
export function bodyFold(s: GarmentSpec, x: number, y: number, side: "front" | "back"): number {
  const h = y - bottomY(s);
  const v = clamp(h / s.length, 0, 1);
  const hw = halfWidthAt(s, v);
  // Side seams stay closed, and the shoulders and neck stay smooth.
  const keep = (1 - smoothstep(0.7, 0.97, Math.abs(x) / hw)) * (1 - smoothstep(0.74, 0.9, v)) * s.drape;
  if (keep <= 0) return 0;
  const k = side === "front" ? 0 : 1.9;
  const ease = clamp((s.hemHalf - 26) / 3, 0, 1);
  // A rib band is taut; the folds start just above it.
  const free = s.band > 0 ? smoothstep(s.band, s.band + 2.5, h) : 1;
  let f = 0;

  // Gathers where the band pulls the body in, and the body puffing out over it.
  if (s.band > 0) {
    const t = (h - s.band) / 10;
    if (t > 0 && t < 1) {
      const w = smoothstep(0, 0.12, t) * (1 - smoothstep(0.3, 1, t));
      const tuck = Math.sin(x / 0.85 + k + 3.2 * (noise(x / 5 + k, 0.5) - 0.5));
      f += w * (0.34 * tuck * (0.6 + 0.8 * noise(x / 3 + 7, k)) + 0.45);
    }
  }

  // Long soft folds hanging from the chest, deeper toward the hem and on looser fits.
  const hang = 1 - smoothstep(0.15, 0.72, v);
  f += free * hang * (0.45 + 0.35 * ease) * Math.sin(x / (2.2 + 0.4 * ease) + k + 0.9 * Math.sin(h / 9 + k));

  // Diagonal folds from each armpit down toward the middle (mirrored on each side).
  const armpitY = -s.shoulderDrop - s.armRadius * 1.7;
  for (let sgn = -1; sgn <= 1; sgn += 2) {
    const px = sgn * x - hw * 0.9;
    const py = y - armpitY;
    const along = -0.6 * px - 0.8 * py;
    if (along <= 0 || along >= 26) continue;
    const across = 0.8 * px - 0.6 * py;
    const fall = Math.sin((Math.PI * along) / 26);
    f -= 0.7 * fall * Math.exp(-(across * across) / 5);
    f += 0.4 * fall * Math.exp(-((across - 2.6) ** 2) / 3.5);
    f += 0.1 * fall * Math.sin(across / 0.55 + along / 7) * Math.exp(-((across - 1) ** 2) / 14);
  }

  // A plain hem is folded up and sewn, so its last 2.4 cm are two layers thick.
  if (s.band === 0) f += 0.09 * (1 - smoothstep(2.2, 2.6, h));

  // Small irregular wrinkles, so it doesn't look machine-made.
  f += free * (0.22 * (noise(x / 7 + k * 3, h / 9) - 0.5) + 0.1 * (noise(x / 2.6 + 11 + k, h / 3.4) - 0.5));
  return f * keep;
}

/** Surface height for any (x, y) on one side (used to lay prints on the body). */
export function surfaceZ(s: GarmentSpec, x: number, y: number, side: "front" | "back"): number {
  const bot = bottomY(s);
  const top = topY(s, x, side);
  const v = clamp((y - bot) / (top - bot), 0, 1);
  const u = clamp(x / halfWidthAt(s, v), -1, 1);
  const z = bodyZ(s, u, v, x) + bodyFold(s, x, y, side);
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
  /** How much the sleeve folds (from the garment). */
  drape: number;
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
  return { samples, shoulder, length: acc - shoulder - cuff, side, drape: s.drape };
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

/** Folds on a sleeve, in cm outward: bunching above the cuff, elbow creases, a soft wave at a short hem. */
export function sleeveFold(path: SleevePath, along: number, theta: number): number {
  const L = path.length;
  if (along <= 0.5 || along >= L) return 0;
  const sd = path.side;
  let f = 0;
  if (L > 35) {
    const w = smoothstep(L - 24, L - 8, along) * (1 - smoothstep(L - 1.5, L, along));
    const phase = along / 0.75 + 6.6 * (noise(along / 3 + sd * 7, theta * 1.3) - 0.5) + 1.1 * Math.sin(theta * 2 + sd);
    const depth = (0.38 + 0.22 * Math.cos(theta + 0.5 * sd)) * (0.6 + 0.8 * noise(along / 5 + 3, theta * 0.9 + sd));
    f += w * (depth * Math.sin(phase) + 0.1 * Math.sin(along / 0.35 + theta * 3));
    const elbow = Math.exp(-((along - L * 0.55) ** 2) / 30);
    f += elbow * 0.3 * Math.sin(along / 0.9 + 2 * Math.sin(theta)) * (0.5 + 0.5 * Math.cos(theta - Math.PI * 0.5 * sd));
  } else {
    f += smoothstep(L * 0.4, L, along) * 0.3 * Math.sin(theta * 3 + 0.7 * sd);
  }
  f += 0.14 * (noise(along / 4, theta * 1.6 + sd * 5) - 0.5);
  return f * smoothstep(0.5, 5, along) * path.drape;
}

export function sleevePoint(path: SleevePath, along: number, theta: number, r0: number): Vec3 {
  const r = r0 + sleeveFold(path, along, theta);
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
  // The ridge of the center seam, and soft folds as the hood rests on the back.
  const fold =
    0.32 * Math.exp(-(a * a) / 0.006) * smoothstep(0.04, 0.25, b) +
    0.35 * Math.sin(b * Math.PI) * Math.sin(a * 4.3 + 0.6) * (1 - Math.abs(a) / HOOD_OPEN);
  const nx = Math.sin(a) / Math.max(w, 1);
  const nz = -Math.cos(a) / Math.max(d, 1);
  const nl = Math.hypot(nx, nz) || 1;
  return [w * Math.sin(a) + (fold * nx) / nl, y, -d * Math.cos(a) + lean + (fold * nz) / nl];
}
