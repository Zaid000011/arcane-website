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
