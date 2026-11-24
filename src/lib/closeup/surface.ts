/**
 * Close-up pictures of fabrics and print methods, drawn in code like a macro
 * photo: every pixel gets a height (mm), a color and a shine, then a low light
 * from the top left rakes across it, with soft shadows and darker crevices.
 * Nothing is downloaded, and every garment color and fabric works.
 *
 * Pure math on typed arrays, so it runs anywhere (and in tests).
 */

export interface Surface {
  size: number;
  /** How many millimetres one pixel covers. */
  mmPerPx: number;
  /** Height above the fabric's lowest point, in mm. */
  h: Float32Array;
  /** Color, linear 0–1. */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** Shine strength 0–1 and sharpness (Blinn-Phong exponent). */
  spec: Float32Array;
  shine: Float32Array;
  /** Fuzz that glows where fibers stand up. */
  sheen: Float32Array;
  /** 0 = plastic or fabric, 1 = metal (the shine takes the color). */
  metal: Float32Array;
}

export function createSurface(size: number, mmPerPx: number): Surface {
  const n = size * size;
  const f = () => new Float32Array(n);
  return { size, mmPerPx, h: f(), r: f(), g: f(), b: f(), spec: f(), shine: f(), sheen: f(), metal: f() };
}

/* ---------- small math helpers ---------- */

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Separable box blur (repeated, it approaches a Gaussian). */
export function blur(src: Float32Array, size: number, radius: number, passes = 2): Float32Array {
  const r = Math.max(0, Math.round(radius));
  const a = Float32Array.from(src);
  if (r === 0) return a;
  const b = new Float32Array(src.length);
  const win = 2 * r + 1;
  const at = (k: number) => (k < 0 ? 0 : k >= size ? size - 1 : k);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[row + at(k)]!;
      for (let x = 0; x < size; x++) {
        b[row + x] = acc / win;
        acc += a[row + at(x + r + 1)]! - a[row + at(x - r)]!;
      }
    }
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += b[at(k) * size + x]!;
      for (let y = 0; y < size; y++) {
        a[y * size + x] = acc / win;
        acc += b[at(y + r + 1) * size + x]! - b[at(y - r) * size + x]!;
      }
    }
  }
  return a;
}

/* ---------- fabric structures ---------- */

/** Plain jersey (the face of a tee or the outside of a hoodie): columns of little "V" stitches. */
function jersey(s: Surface, waleMm: number, yarnMm: number, seed: number) {
  const { size, mmPerPx, h } = s;
  const W = waleMm / mmPerPx;
  const C = W * 0.74;
  const slope = (0.35 * W) / C;
  const cosA = 1 / Math.sqrt(1 + slope * slope);
  const hw = 0.25;
  for (let y = 0; y < size; y++) {
    const ry = y / C;
    const row = Math.floor(ry);
    const fyBase = ry - row;
    for (let x = 0; x < size; x++) {
      const wx = x / W;
      const col = Math.floor(wx);
      const fx = wx - col - 0.5;
      let best = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const fy = fyBase - dr;
        if (fy < -0.3 || fy > 1.3) continue;
        const along = Math.sin(Math.PI * ((fy + 0.3) / 1.6)) ** 0.6;
        const jitter = (hash(col, row + dr, seed) - 0.5) * 0.07;
        for (let side = -1; side <= 1; side += 2) {
          const cx = side * (0.4 - 0.35 * fy) + jitter;
          const q = ((fx - cx) * cosA) / hw;
          if (q <= -1 || q >= 1) continue;
          const prof = Math.sqrt(1 - q * q);
          // Plied yarn: fine diagonal twist lines along each leg.
          const twist = 0.09 * Math.sin((q * 1.7 + fy * 7 * side) * Math.PI);
          const v = prof * along * (1 + twist);
          if (v > best) best = v;
        }
      }
      h[y * size + x] = best * yarnMm;
    }
  }
}

/** Tiny holes in a staggered grid: the "bird's eye" mesh of sports polyester. */
function airHoles(s: Surface, pitchMm: number, radiusMm: number) {
  const { size, mmPerPx, h, r, g, b } = s;
  const P = pitchMm / mmPerPx;
  const Q = P * 0.86;
  const rad = radiusMm / mmPerPx;
  for (let y = 0; y < size; y++) {
    const row = Math.round(y / Q);
    const cy = row * Q;
    const off = row & 1 ? P / 2 : 0;
    for (let x = 0; x < size; x++) {
      const cx = Math.round((x - off) / P) * P + off;
      const d = Math.hypot(x - cx, y - cy);
      if (d >= rad) continue;
      const k = smoothstep(rad, rad * 0.45, d);
      const i = y * size + x;
      h[i]! *= 1 - 0.95 * k;
      r[i]! *= 1 - 0.75 * k;
      g[i]! *= 1 - 0.75 * k;
      b[i]! *= 1 - 0.75 * k;
    }
  }
}

/** Piqué: a waffle of small raised diamonds, each with a little dimple: the classic polo texture. */
function pique(s: Surface, cellMm: number, heightMm: number, seed: number) {
  const { size, mmPerPx, h } = s;
  const P = cellMm / mmPerPx;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // A square grid turned 45° and squashed a little.
      const u = (x * 0.8 + y) / P;
      const v = (y - x * 0.8) / P;
      const cu = Math.floor(u);
      const cv = Math.floor(v);
      const e = 1 - 2 * Math.max(Math.abs(u - cu - 0.5), Math.abs(v - cv - 0.5));
      const pillow = smoothstep(0, 0.5, e) ** 0.7;
      const dimple = 0.4 * smoothstep(0.55, 1, e);
      const knit = 0.07 * Math.sin((x * mmPerPx * 2 * Math.PI) / 0.32) * Math.sin((y * mmPerPx * 2 * Math.PI) / 0.26);
      const lumpy = 0.88 + 0.24 * hash(cu, cv, seed);
      h[y * size + x] = heightMm * (pillow * lumpy - dimple + knit + 0.1);
    }
  }
}

/** Small yarn loops in rows, each turned a little its own way: the inside of French terry. */
function terryLoops(s: Surface, pitchMm: number, loopMm: number, seed: number) {
  const { size, mmPerPx, h } = s;
  const P = pitchMm / mmPerPx;
  const Q = P * 0.78;
  const yarn = 0.13 * P;
  for (let y = 0; y < size; y++) {
    const row0 = Math.floor(y / Q);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // Loops overlap their neighbors a little, so check those too.
      for (let row = row0 - 1; row <= row0 + 1; row++) {
        const off = row & 1 ? 0.5 : 0;
        const col0 = Math.floor(x / P - off);
        for (let col = col0 - 1; col <= col0 + 1; col++) {
          const j = hash(col, row, seed);
          const k = hash(col, row, seed + 1);
          const cx = (col + off + 0.5 + (j - 0.5) * 0.25) * P;
          const cy = (row + 0.5 + (k - 0.5) * 0.25) * Q;
          const angle = (j - 0.5) * 1.2;
          const ca = Math.cos(angle);
          const sa = Math.sin(angle);
          const lx = (x - cx) * ca + (y - cy) * sa;
          const ly = (y - cy) * ca - (x - cx) * sa;
          const ax = 0.34 * P * (0.85 + 0.3 * k);
          const ay = 0.22 * P * (0.85 + 0.3 * j);
          const ring = Math.abs(Math.hypot(lx / ax, ly / ay) - 1) * Math.min(ax, ay);
          if (ring >= yarn) continue;
          const top = 0.05 + loopMm * Math.sqrt(1 - (ring / yarn) ** 2) * (0.8 + 0.4 * k);
          if (top > h[i]!) h[i] = top;
        }
      }
    }
  }
}

/** Soft noise for felted wool or brushed fleece. */
function cloud(s: Surface, scaleMm: number, ampMm: number, seed: number, octaves = 3) {
  const { size, mmPerPx, h } = s;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) h[y * size + x]! += ampMm * fbm((x * mmPerPx) / scaleMm, (y * mmPerPx) / scaleMm, seed, octaves);
  }
}

/** Loose fibers lying on the surface (cotton fuzz, brushed fleece, wool). Lighter fiber tips catch the light. */
function fibers(
  s: Surface,
  o: { perMm2: number; lengthMm: [number, number]; widthMm: number; heightMm: number; curl: number; lighten: number; seed: number },
) {
  const { size, mmPerPx, h } = s;
  const count = Math.min(40_000, Math.round((size * mmPerPx) ** 2 * o.perMm2));
  const rand = rng(o.seed);
  const w = Math.max(0.7, o.widthMm / mmPerPx);
  const reach = Math.ceil(w * 1.6);
  const tint = new Float32Array(size * size);
  for (let n = 0; n < count; n++) {
    let x = rand() * size;
    let y = rand() * size;
    let angle = rand() * Math.PI * 2;
    const length = (o.lengthMm[0] + rand() * (o.lengthMm[1] - o.lengthMm[0])) / mmPerPx;
    const amp = o.heightMm * (0.45 + 0.55 * rand());
    const light = o.lighten * (rand() * 2 - 0.6);
    const steps = Math.max(2, Math.ceil(length / Math.max(1, w)));
    const dl = length / steps;
    const turn = (rand() - 0.5) * o.curl;
    for (let k = 0; k < steps; k++) {
      const taper = Math.sin(Math.PI * (0.12 + (0.76 * k) / (steps - 1)));
      const x0 = Math.floor(x - reach);
      const y0 = Math.floor(y - reach);
      for (let yy = y0; yy <= y0 + 2 * reach; yy++) {
        if (yy < 0 || yy >= size) continue;
        for (let xx = x0; xx <= x0 + 2 * reach; xx++) {
          if (xx < 0 || xx >= size) continue;
          const d2 = ((xx - x) ** 2 + (yy - y) ** 2) / (w * w);
          if (d2 > 2.6) continue;
          const p = Math.exp(-d2 * 1.6) * taper;
          const i = yy * size + xx;
          // Fibers rest on top of whatever is under them.
          const top = amp * p * 0.55;
          if (top > 0) h[i]! += top * (1 - Math.min(1, h[i]! / (amp * 4 + 1e-6)) * 0.3);
          tint[i]! += light * p * 0.5;
        }
      }
      x += Math.cos(angle) * dl;
      y += Math.sin(angle) * dl;
      angle += turn;
    }
  }
  for (let i = 0; i < tint.length; i++) {
    const k = 1 + Math.max(-0.35, Math.min(0.5, tint[i]!));
    s.r[i]! *= k;
    s.g[i]! *= k;
    s.b[i]! *= k;
  }
}

/* ---------- fabrics ---------- */

export type FabricSide = "outside" | "inside";

interface FabricLook {
  /** Builds the height field. */
  build: (s: Surface, side: FabricSide, seed: number) => void;
  spec: number;
  shine: number;
  sheen: number;
  /** Random lighter and darker fibers (blends look slightly heathered). */
  heather?: number;
  /** Whether the inside looks different enough to show it. */
  inside?: boolean;
}

const LOOKS: Record<string, FabricLook> = {
  cotton: {
    build: (s, _side, seed) => {
      jersey(s, 0.78, 0.36, seed);
      fibers(s, { perMm2: 7, lengthMm: [0.4, 1.4], widthMm: 0.016, heightMm: 0.05, curl: 0.9, lighten: 0.22, seed: seed + 1 });
    },
    spec: 0.05,
    shine: 8,
    sheen: 0.3,
  },
  cottonPoly: {
    build: (s, _side, seed) => {
      jersey(s, 0.66, 0.3, seed);
      fibers(s, { perMm2: 3, lengthMm: [0.3, 1], widthMm: 0.014, heightMm: 0.03, curl: 0.6, lighten: 0.18, seed: seed + 1 });
    },
    spec: 0.16,
    shine: 18,
    sheen: 0.2,
    heather: 0.08,
  },
  polyester: {
    build: (s, _side, seed) => {
      jersey(s, 0.5, 0.24, seed);
      airHoles(s, 1.05, 0.2);
    },
    spec: 0.42,
    shine: 34,
    sheen: 0.05,
  },
  cottonFleece: {
    build: (s, side, seed) => {
      if (side === "inside") brushed(s, seed, 1);
      else {
        jersey(s, 0.84, 0.4, seed);
        fibers(s, { perMm2: 9, lengthMm: [0.4, 1.6], widthMm: 0.017, heightMm: 0.06, curl: 1, lighten: 0.24, seed: seed + 1 });
      }
    },
    spec: 0.05,
    shine: 8,
    sheen: 0.35,
    inside: true,
  },
  frenchTerry: {
    build: (s, side, seed) => {
      if (side === "inside") {
        jersey(s, 0.8, 0.14, seed);
        terryLoops(s, 1, 0.34, seed + 3);
      } else jersey(s, 0.8, 0.36, seed);
    },
    spec: 0.06,
    shine: 9,
    sheen: 0.22,
    inside: true,
  },
  blendFleece: {
    build: (s, side, seed) => {
      if (side === "inside") brushed(s, seed, 0.75);
      else {
        jersey(s, 0.72, 0.34, seed);
        fibers(s, { perMm2: 4, lengthMm: [0.3, 1.1], widthMm: 0.015, heightMm: 0.035, curl: 0.7, lighten: 0.18, seed: seed + 1 });
      }
    },
    spec: 0.14,
    shine: 16,
    sheen: 0.3,
    heather: 0.06,
    inside: true,
  },
  polyFleece: {
    build: (s, side, seed) => {
      if (side === "inside") brushed(s, seed, 0.9);
      else jersey(s, 0.56, 0.26, seed);
    },
    spec: 0.36,
    shine: 30,
    sheen: 0.25,
    inside: true,
  },
  pique: {
    build: (s, _side, seed) => {
      pique(s, 1.5, 0.42, seed);
      fibers(s, { perMm2: 5, lengthMm: [0.4, 1.2], widthMm: 0.016, heightMm: 0.04, curl: 0.9, lighten: 0.2, seed: seed + 1 });
    },
    spec: 0.05,
    shine: 8,
    sheen: 0.25,
  },
  polyPique: {
    build: (s, _side, seed) => pique(s, 1.1, 0.32, seed),
    spec: 0.22,
    shine: 20,
    sheen: 0.06,
  },
  melton: {
    build: (s, _side, seed) => {
      cloud(s, 1.1, 0.16, seed, 4);
      fibers(s, { perMm2: 26, lengthMm: [0.25, 0.9], widthMm: 0.014, heightMm: 0.045, curl: 1.4, lighten: 0.2, seed: seed + 1 });
    },
    spec: 0.02,
    shine: 6,
    sheen: 0.5,
  },
};

function brushed(s: Surface, seed: number, fluff: number) {
  cloud(s, 1.4, 0.05 * fluff, seed, 2);
  fibers(s, { perMm2: 26 * fluff, lengthMm: [1.4, 3.6], widthMm: 0.05, heightMm: 0.07, curl: 0.45, lighten: 0.3, seed: seed + 2 });
  fibers(s, { perMm2: 9 * fluff, lengthMm: [1, 2.4], widthMm: 0.035, heightMm: 0.05, curl: 0.8, lighten: 0.45, seed: seed + 3 });
}

const BY_KIND: Record<string, string> = { cotton: "cotton", blend: "cottonPoly", polyester: "polyester", wool: "melton" };

export function fabricLookId(fabricId: string, kind: string): string {
  return LOOKS[fabricId] ? fabricId : (BY_KIND[kind] ?? "cotton");
}

/** Whether a fabric's inside is worth showing next to its outside (brushed fleece, terry loops). */
export function hasDistinctInside(fabricId: string, kind: string): boolean {
  return Boolean(LOOKS[fabricLookId(fabricId, kind)]!.inside);
}

/** A square of fabric in the garment color, ready for a print or for shading. */
export function fabricSurface(opts: { fabricId: string; kind: string; color: string; size: number; mmPerPx: number; side?: FabricSide; seed?: number }): Surface {
  const s = createSurface(opts.size, opts.mmPerPx);
  const look = LOOKS[fabricLookId(opts.fabricId, opts.kind)]!;
  const seed = opts.seed ?? 7;
  const [cr, cg, cb] = hexToLinear(opts.color);
  s.r.fill(cr);
  s.g.fill(cg);
  s.b.fill(cb);
  look.build(s, opts.side ?? "outside", seed);
  if (look.heather) fibers(s, { perMm2: 10, lengthMm: [0.6, 2], widthMm: 0.02, heightMm: 0, curl: 0.3, lighten: look.heather * 3, seed: seed + 9 });
  s.spec.fill(look.spec);
  s.shine.fill(look.shine);
  s.sheen.fill(look.sheen);
  return s;
}

/* ---------- prints ---------- */

/** The artwork at close-up size: coverage 0–1 and color (linear), per pixel. */
export interface Art {
  a: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Puts a print on the fabric the way each method really sits: soaked in, on top, raised or stitched. */
export function applyPrint(s: Surface, art: Art, methodId: string, seed = 11) {
  const { size, mmPerPx, h } = s;
  const px = (mm: number) => mm / mmPerPx;
  const n = size * size;
  let maxH = 0;
  for (let i = 0; i < n; i++) if (h[i]! > maxH) maxH = h[i]!;
  const fabricN = (i: number) => (maxH > 0 ? h[i]! / maxH : 0.5);

  const paint = (i: number, t: number, k = 1) => {
    s.r[i] = mix(s.r[i]!, art.r[i]! * k, t);
    s.g[i] = mix(s.g[i]!, art.g[i]! * k, t);
    s.b[i] = mix(s.b[i]!, art.b[i]! * k, t);
  };

  switch (methodId) {
    case "dtg":
    case "sublimation": {
      // Ink goes into the fibers: the knit shows through, nothing sits on top.
      const soak = methodId === "sublimation" ? 1 : 0.93;
      for (let i = 0; i < n; i++) {
        const t = art.a[i]!;
        if (t <= 0) continue;
        paint(i, t * soak, methodId === "dtg" ? 0.86 + 0.14 * fabricN(i) : 0.97 + 0.03 * fabricN(i));
      }
      return;
    }
    case "screen":
    case "dtf":
    case "vinyl":
    case "vinylSpecial": {
      // A layer on top: screen ink half-fills the knit, DTF film and vinyl smooth it over.
      const m = blur(art.a, size, px(methodId === "screen" ? 0.05 : 0.03), 1);
      const keep = methodId === "screen" ? 0.55 : methodId === "dtf" ? 0.32 : 0.04;
      const lift = methodId === "screen" ? 0.07 : methodId === "dtf" ? 0.11 : 0.16;
      const spec = methodId === "screen" ? 0.12 : methodId === "dtf" ? 0.4 : 0.85;
      const shine = methodId === "screen" ? 14 : methodId === "dtf" ? 45 : 110;
      const metal = methodId === "vinylSpecial";
      const P = px(0.32);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const t = m[i]!;
          if (t <= 0.002) continue;
          let top = h[i]! * keep + lift;
          if (metal) {
            // Glitter: each flake is a tiny mirror tilted its own way.
            const cx = Math.floor(x / P);
            const cy = Math.floor(y / P);
            const gx = (hash(cx, cy, seed) - 0.5) * 0.9;
            const gy = (hash(cx, cy, seed + 1) - 0.5) * 0.9;
            top += (gx * (x - (cx + 0.5) * P) + gy * (y - (cy + 0.5) * P)) * mmPerPx;
          }
          h[i] = mix(h[i]!, top, t);
          // Screen ink is a little grainy; film and vinyl are perfectly even.
          paint(i, t, methodId === "screen" ? 0.94 + 0.08 * hash(x >> 1, y >> 1, seed) : 1);
          s.spec[i] = mix(s.spec[i]!, metal ? 1.4 : spec, t);
          s.shine[i] = mix(s.shine[i]!, metal ? 160 : shine, t);
          s.sheen[i] = mix(s.sheen[i]!, 0, t);
          if (metal) s.metal[i] = 0.9 * t;
        }
      }
      return;
    }
    case "puff": {
      // Ink that swells with heat into a soft, rounded, slightly foamy relief.
      const m = blur(art.a, size, px(0.35), 2);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const t = m[i]!;
          if (t <= 0.01) continue;
          const foam = fbm((x * mmPerPx) / 0.12, (y * mmPerPx) / 0.12, seed, 2);
          const cover = smoothstep(0.02, 0.45, t);
          h[i] = mix(h[i]!, h[i]! * 0.15 + 0.95 * t ** 0.65 + 0.05 * foam * t, cover);
          paint(i, cover, 1.04 + 0.08 * foam);
          s.spec[i] = mix(s.spec[i]!, 0.05, cover);
          s.shine[i] = mix(s.shine[i]!, 6, cover);
          s.sheen[i] = mix(s.sheen[i]!, 0.08, cover);
        }
      }
      return;
    }
    case "embroidery":
    case "embroidery3d": {
      // Rows of shiny satin threads; 3D embroidery wraps them over a foam bump.
      const raised = methodId === "embroidery3d";
      const m = blur(art.a, size, px(raised ? 0.55 : 0.12), raised ? 2 : 1);
      const angle = raised ? 1.45 : 0.72;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const pitch = 0.42;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const t = m[i]!;
          if (t <= 0.01) continue;
          const across = ((x * ca + y * sa) * mmPerPx) / pitch;
          const thread = Math.floor(across);
          const prof = 0.5 + 0.5 * Math.cos(2 * Math.PI * (across - thread - 0.5) * 0.98);
          const along = ((-x * sa + y * ca) * mmPerPx) / 3.2 + hash(thread, 0, seed) * 0.9;
          const gap = smoothstep(0, 0.035, Math.abs(along - Math.round(along)));
          const cover = smoothstep(0.04, 0.35, t);
          const body = raised ? 1.5 * t ** 0.5 : 0.36 * t ** 0.4;
          h[i] = mix(h[i]!, body + 0.13 * prof * gap, cover);
          paint(i, cover, 0.7 + 0.42 * prof);
          s.spec[i] = mix(s.spec[i]!, 0.75 * prof, cover);
          s.shine[i] = mix(s.shine[i]!, 26, cover);
          s.sheen[i] = mix(s.sheen[i]!, 0.15, cover);
        }
      }
      return;
    }
    case "wovenPatch":
    case "chenillePatch": {
      // A thick sewn-on patch with a stitched rim; chenille is fluffy loops, woven is a fine weave.
      const chenille = methodId === "chenillePatch";
      const m = blur(art.a, size, px(0.3), 1);
      const fluff = chenille ? createSurface(size, mmPerPx) : null;
      if (fluff) {
        cloud(fluff, 0.45, 0.25, seed, 3);
        fibers(fluff, { perMm2: 30, lengthMm: [0.4, 1.4], widthMm: 0.02, heightMm: 0.12, curl: 1.6, lighten: 0, seed: seed + 5 });
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const t = m[i]!;
          if (t <= 0.01) continue;
          const body = 0.55 * smoothstep(0.05, 0.6, t);
          const rim = Math.max(0, 1 - Math.abs(t - 0.55) * 4.5);
          const stitch = 0.5 + 0.5 * Math.cos(((x + y) * mmPerPx * 2 * Math.PI) / 0.55);
          const weave = (Math.sin((x * mmPerPx * 2 * Math.PI) / 0.24) * Math.sin((y * mmPerPx * 2 * Math.PI) / 0.24) > 0 ? 1 : 0) * 0.03;
          const texture = fluff ? fluff.h[i]! : weave;
          h[i] = mix(h[i]!, body + texture * smoothstep(0.6, 0.9, t) + rim * (0.22 + 0.06 * stitch), smoothstep(0.02, 0.3, t));
          paint(i, smoothstep(0.02, 0.3, t), chenille ? 0.95 + 0.1 * clamp01(texture * 4) : 0.92 + 0.12 * (weave > 0 ? 1 : 0));
          s.spec[i] = mix(s.spec[i]!, chenille ? 0.02 : 0.12, t);
          s.shine[i] = mix(s.shine[i]!, 10, t);
          s.sheen[i] = mix(s.sheen[i]!, chenille ? 0.6 : 0.1, t);
        }
      }
      return;
    }
    default: {
      // Unknown method: show it as a smooth film.
      applyPrint(s, art, "dtf", seed);
    }
  }
}

/* ---------- lighting ---------- */

const norm = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

/** Rounds off highlights softly instead of clipping them to flat white. */
const rolloff = (v: number) => (v <= 0.88 ? v : 0.88 + 0.12 * (1 - Math.exp(-(v - 0.88) / 0.12)));

/** A low light from the top left (shows texture), a weaker one from the right, and a big soft light overhead that glossy prints mirror. */
const KEY = norm(-0.62, -0.55, 0.56);
const FILL = norm(0.72, 0.3, 0.62);
const BOX = norm(-0.25, -0.22, 1);

/**
 * Lights the surface like a macro photo and returns RGBA pixels. Brightness
 * is set so the average color matches the garment color: a close-up of navy
 * still reads as the same navy.
 */
export function shade(s: Surface): Uint8ClampedArray {
  const { size, mmPerPx, h } = s;
  const n = size * size;
  const avg = blur(h, size, Math.min(30, Math.max(1, 0.2 / mmPerPx)), 2);
  const diffuse = new Float32Array(n);
  const glow = new Float32Array(n);
  const fuzz = new Float32Array(n);
  const H1 = norm(KEY[0], KEY[1], KEY[2] + 1);
  const H2 = norm(FILL[0], FILL[1], FILL[2] + 1);
  const lxy = Math.hypot(KEY[0], KEY[1]);
  const ux = KEY[0] / lxy;
  const uy = KEY[1] / lxy;
  const stepPx = 1.25;
  const rise = (KEY[2] / lxy) * mmPerPx * stepPx;
  const steps = Math.min(48, Math.ceil(1.2 / rise) + 4);
  const half = size / 2;
  const camera = size * 2.2;
  let sum = 0;
  let counted = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const xl = x > 0 ? i - 1 : i;
      const xr = x < size - 1 ? i + 1 : i;
      const yu = y > 0 ? i - size : i;
      const yd = y < size - 1 ? i + size : i;
      const dx = (h[xr]! - h[xl]!) / ((xr - xl || 1) * mmPerPx);
      const dy = (h[yd]! - h[yu]!) / (((yd - yu) / size || 1) * mmPerPx);
      const [nx, ny, nz] = norm(-dx, -dy, 1);

      // Soft shadow: walk toward the light and see if anything taller is in the way.
      let occ = 0;
      const h0 = h[i]! + 0.003;
      for (let k = 1; k <= steps; k++) {
        const sx = Math.round(x + ux * k * stepPx);
        const sy = Math.round(y + uy * k * stepPx);
        if (sx < 0 || sy < 0 || sx >= size || sy >= size) break;
        const o = (h[sy * size + sx]! - (h0 + rise * k)) / 0.05;
        if (o > occ) {
          occ = o;
          if (occ >= 1) break;
        }
      }
      const shadow = 1 - Math.min(1, occ) * 0.62;
      const ao = 1 - 0.72 * clamp01((avg[i]! - h[i]!) / 0.11);
      const ndl = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
      const ndl2 = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
      const metal = s.metal[i]!;
      const d = (1 - metal * 0.6) * (0.34 * ao + ndl * shadow * (0.55 + 0.45 * ao) + 0.3 * ndl2 * ao);
      diffuse[i] = d;
      if (metal < 0.5) {
        sum += d;
        counted++;
      }

      // Shine: the key light's highlight, plus the overhead light mirrored in glossy surfaces
      // (seen from a camera above the middle, so the reflection sweeps across like in a photo).
      const spec = s.spec[i]!;
      if (spec > 0) {
        const shine = s.shine[i]!;
        const vl = Math.hypot((half - x) / camera, (half - y) / camera, 1);
        const vx = (half - x) / camera / vl;
        const vy = (half - y) / camera / vl;
        const vz = 1 / vl;
        const ndv = nx * vx + ny * vy + nz * vz;
        const rx = 2 * ndv * nx - vx;
        const ry = 2 * ndv * ny - vy;
        const rz = 2 * ndv * nz - vz;
        const rough = clamp01(1 - shine / 140);
        const box = smoothstep(Math.cos(0.32 + 0.6 * rough), Math.cos(0.08 + 0.3 * rough), rx * BOX[0] + ry * BOX[1] + rz * BOX[2]);
        const key = Math.max(0, nx * H1[0] + ny * H1[1] + nz * H1[2]) ** shine * shadow + 0.3 * Math.max(0, nx * H2[0] + ny * H2[1] + nz * H2[2]) ** shine;
        glow[i] = spec * (key + 0.6 * box * (1 - 0.65 * rough));
      }
      fuzz[i] = s.sheen[i]! * (1 - nz) ** 1.2 * (0.55 + 0.45 * ndl) * 1.6;
    }
  }

  // Average light → the garment's own color, plus a little extra on very dark garments so their texture shows.
  let lum = 0;
  let samples = 0;
  for (let i = 0; i < n; i += 29) {
    lum += 0.2126 * s.r[i]! + 0.7152 * s.g[i]! + 0.0722 * s.b[i]!;
    samples++;
  }
  lum /= samples;
  const exposure = (counted / Math.max(1e-6, sum)) * (1 + 0.6 * (1 - smoothstep(0.004, 0.05, lum)));

  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const metal = s.metal[i]!;
    const d = diffuse[i]! * exposure;
    const g = glow[i]!;
    const f = fuzz[i]! * exposure;
    const rgb = [s.r[i]!, s.g[i]!, s.b[i]!];
    for (let c = 0; c < 3; c++) {
      const base = rgb[c]!;
      const tint = metal > 0 ? mix(1, base * 2.4, metal) : 1;
      out[i * 4 + c] = Math.round(linearToSrgb(rolloff(base * d + g * tint + f * (base * 0.6 + 0.03))) * 255);
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}
