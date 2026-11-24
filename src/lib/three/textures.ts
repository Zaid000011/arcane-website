import * as THREE from "three";

/**
 * Surface textures drawn in code (no image downloads): each is a height
 * pattern turned into a normal map, which makes light catch the fabric weave,
 * rib, embroidery thread, glitter or chenille fuzz.
 */

const cache = new Map<string, THREE.Texture>();

function normalTexture(key: string, size: number, height: (x: number, y: number) => number, strength: number): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x, y);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Jersey knit: rows of small "V" loops. One tile ≈ 10 cm. */
export function knitNormal(): THREE.Texture {
  const cell = 8;
  return normalTexture(
    "knit",
    256,
    (x, y) => {
      const cx = (x % cell) - cell / 2;
      const cy = (y % cell) / cell;
      const v = Math.abs(cx) / (cell / 2);
      return Math.cos((v - cy) * Math.PI) * 0.5 + 0.5 * Math.sin((y / cell) * Math.PI * 2) * 0.2;
    },
    2.2,
  );
}

/** Rib knit: vertical ridges for cuffs, waistbands and collars. */
export function ribNormal(): THREE.Texture {
  return normalTexture("rib", 128, (x) => Math.sin((x / 128) * Math.PI * 2 * 16) * 0.5 + 0.5, 3.5);
}

/** Satin embroidery: tight diagonal threads with a little irregularity. */
export function threadNormal(): THREE.Texture {
  return normalTexture(
    "thread",
    256,
    (x, y) => {
      const t = (x + y * 0.6) / 3.2;
      return Math.pow(Math.abs(Math.sin(t)), 0.6) + Math.sin(y * 0.9 + Math.sin(x * 0.3) * 2) * 0.08;
    },
    3,
  );
}

let seed = 1;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function noiseField(size: number, dots: number, radius: number): Float32Array {
  seed = 7;
  const field = new Float32Array(size * size);
  for (let i = 0; i < dots; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const amp = 0.4 + rand() * 0.6;
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const d = Math.hypot(x, y) / radius;
        if (d > 1) continue;
        const px = (Math.floor(cx + x) + size) % size;
        const py = (Math.floor(cy + y) + size) % size;
        field[py * size + px]! += amp * (1 - d * d);
      }
    }
  }
  return field;
}

/** Glitter vinyl: scattered tiny facets. */
export function glitterNormal(): THREE.Texture {
  const size = 256;
  const f = noiseField(size, 2600, 2);
  return normalTexture("glitter", size, (x, y) => f[y * size + x]!, 2.5);
}

/** Chenille: fluffy loops. */
export function chenilleNormal(): THREE.Texture {
  const size = 256;
  const f = noiseField(size, 1400, 5);
  return normalTexture("chenille", size, (x, y) => f[y * size + x]!, 1.6);
}

/** Woven label: very fine criss-cross. */
export function weaveNormal(): THREE.Texture {
  return normalTexture("weave", 128, (x, y) => (Math.sin(x * 1.6) * 0.5 + 0.5) * (Math.sin(y * 1.6) * 0.5 + 0.5), 2.5);
}

/** Seamless random value per cell, so patterns can repeat without a visible edge. */
const cellRand = (cx: number, cy: number, wrapX: number, wrapY: number) => {
  let h = (Math.imul(((cx % wrapX) + wrapX) % wrapX, 374761393) + Math.imul(((cy % wrapY) + wrapY) % wrapY, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Fine jersey knit as it really looks: columns of small "V" stitches made of
 * twisted yarn. One tile is 16 × 22 stitches (about 12 mm), and it repeats
 * without seams.
 */
export function fineKnitNormal(): THREE.Texture {
  const size = 512;
  const wales = 16;
  const courses = 22;
  const W = size / wales;
  const C = size / courses;
  const cosA = 1 / Math.sqrt(1 + ((0.35 * W) / C) ** 2);
  return normalTexture(
    "fineKnit",
    size,
    (x, y) => {
      const ry = y / C;
      const row = Math.floor(ry);
      const fyBase = ry - row;
      const wx = x / W;
      const col = Math.floor(wx);
      const fx = wx - col - 0.5;
      let best = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const fy = fyBase - dr;
        if (fy < -0.3 || fy > 1.3) continue;
        const along = Math.sin(Math.PI * ((fy + 0.3) / 1.6)) ** 0.6;
        const jitter = (cellRand(col, row + dr, wales, courses) - 0.5) * 0.07;
        for (let side = -1; side <= 1; side += 2) {
          const cx = side * (0.4 - 0.35 * fy) + jitter;
          const q = ((fx - cx) * cosA) / 0.26;
          if (q <= -1 || q >= 1) continue;
          const twist = 0.08 * Math.sin((q * 1.7 + fy * 7 * side) * Math.PI);
          best = Math.max(best, Math.sqrt(1 - q * q) * along * (1 + twist));
        }
      }
      return best;
    },
    1.4,
  );
}

/** Piqué: a waffle of small raised diamonds (polo shirts). One tile is 8 × 8 cells. */
export function piqueNormal(): THREE.Texture {
  const size = 256;
  const P = size / 8;
  return normalTexture(
    "pique",
    size,
    (x, y) => {
      const u = (x + y) / P;
      const v = (y - x + size) / P;
      const e = 1 - 2 * Math.max(Math.abs(u - Math.floor(u) - 0.5), Math.abs(v - Math.floor(v) - 0.5));
      const pillow = Math.min(1, e / 0.5) ** 0.7;
      return pillow - 0.4 * Math.max(0, (e - 0.55) / 0.45);
    },
    1.6,
  );
}

/** Felted wool (melton): dense, fine fuzz with no visible knit. */
export function feltNormal(): THREE.Texture {
  const size = 256;
  const f = noiseField(size, 5200, 2);
  return normalTexture("felt", size, (x, y) => f[y * size + x]!, 1.1);
}

/**
 * The faint, uneven tone of real cotton: fibers and yarn that aren't all
 * the same shade. Multiplied over the garment color (white = no change).
 * Tileable, about 4 cm per tile.
 */
export function fabricMottle(): THREE.Texture {
  const hit = cache.get("mottle");
  if (hit) return hit;
  const size = 256;
  const f = noiseField(size, 3200, 1);
  const g = noiseField(size, 260, 9);
  let max = 0;
  let maxG = 0;
  for (let i = 0; i < f.length; i++) {
    max = Math.max(max, f[i]!);
    maxG = Math.max(maxG, g[i]!);
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // Mostly 1.0, with fine fiber speckle and broad soft patches a few percent darker.
    const v = 1 - 0.07 * (f[i]! / (max || 1)) - 0.04 * (g[i]! / (maxG || 1));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(v * 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set("mottle", tex);
  return tex;
}

/** Dashes for stitching: white = thread, black = gap (used as an alpha map along a thread). */
export function stitchDashes(): THREE.Texture {
  const hit = cache.get("dashes");
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 32, 4);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 21, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  cache.set("dashes", tex);
  return tex;
}

/** Soft round shadow under the garment. */
export function groundShadow(): THREE.Texture {
  const hit = cache.get("ground");
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.6, "rgba(0,0,0,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  cache.set("ground", tex);
  return tex;
}
