// Turns the original garment photos into the files the site uses.
//
//   npm run mockups
//
// Reads mockups-src/<mockup>-<sleeve>-<view>.png (2048×2048 white garments on a
// transparent background, kept out of git) and scripts/mockup-landmarks.json
// (points measured by hand on those photos), then writes:
//   public/mockups/<name>.webp       1600 px, for the designer
//   public/mockups/720/<name>.webp   720 px, for small pictures (cart, cards)
//   src/lib/mockup/photo-data.ts     the measurements the site places prints with
//
// sharp comes with Next.js, so nothing extra needs installing.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");

const SRC = path.join(root, "mockups-src");
const OUT = path.join(root, "public", "mockups");
const SIZES = [
  { dir: OUT, size: 1600 },
  { dir: path.join(OUT, "720"), size: 720 },
];

// Garment length and neckline depths in cm (the same numbers as src/lib/three/shape.ts).
const SPEC = {
  tshirt: { length: 72, front: 8, back: 2.5 },
  polo: { length: 72, front: 4, back: 2 },
  hoodie: { length: 70, front: 7, back: 2 },
  zipHoodie: { length: 70, front: 7, back: 2 },
  sweatshirt: { length: 68, front: 7.5, back: 2.5 },
  varsity: { length: 66, front: 9, back: 2.5 },
};

// The photographed garments sit on a slim form, so their chests look narrower
// than a real garment's flat width. Scaling cm slightly down keeps prints the
// size they'd look on a real person.
const PRINT_SCALE = 0.88;

const landmarks = JSON.parse(readFileSync(path.join(root, "scripts", "mockup-landmarks.json"), "utf8"));
for (const { dir } of SIZES) mkdirSync(dir, { recursive: true });

const data = {};
for (const [name, lm] of Object.entries(landmarks)) {
  const [mockup, , view] = name.split("-");
  const spec = SPEC[mockup];
  if (!spec) throw new Error(`Unknown garment in ${name}`);
  const { data: px, info } = await sharp(path.join(SRC, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;

  // Clean the background: fully see-through pixels get no color (smaller files, no halos).
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  const lum = [];
  for (let i = 0, y = 0; y < H; y++) {
    for (let x = 0; x < W; x++, i += 4) {
      const a = px[i + 3];
      if (a < 4) {
        px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
        continue;
      }
      if (a > 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (a > 250 && (x + y) % 5 === 0) lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    }
  }
  lum.sort((a, b) => a - b);
  // Well-lit fabric: brighter than 90% of the garment.
  const white = Math.round(lum[Math.floor(lum.length * 0.9)]);

  const raw = sharp(px, { raw: { width: W, height: H, channels: 4 } });
  for (const { dir, size } of SIZES) {
    await raw
      .clone()
      .resize(size, size, { kernel: "lanczos3" })
      .webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toFile(path.join(dir, `${name}.webp`));
  }

  const drop = view === "front" ? spec.front : spec.back;
  data[name] = {
    size: W,
    box: [x0, y0, x1, y1],
    px: Math.round(((lm.hem - lm.neck[1]) / (spec.length - drop)) * PRINT_SCALE * 100) / 100,
    neck: lm.neck,
    white,
    ...(lm.label ? { label: lm.label } : {}),
    ...(lm.hood ? { hood: lm.hood } : {}),
    ...(lm.strings ? { strings: lm.strings } : {}),
    ...(lm.sleeves ? { sleeves: { left: lm.sleeves.left, right: lm.sleeves.right } } : {}),
  };
  console.log(name, `white ${white}`, `${data[name].px} px/cm`);
}

const ts = `// Made by \`npm run mockups\` (scripts/mockup-photos.mjs) from the photos and
// scripts/mockup-landmarks.json. Change those and run it again instead of editing this.
import type { PhotoData } from "./photos";

export const PHOTO_DATA: Record<string, PhotoData> = ${JSON.stringify(data, null, 2)
  .replace(/\[\s+([-\d.]+),\s+([-\d.]+)\s+\]/g, "[$1, $2]")
  .replace(/\[\s+([-\d.]+),\s+([-\d.]+),\s+([-\d.]+),\s+([-\d.]+)\s+\]/g, "[$1, $2, $3, $4]")
  .replace(/\[\s+(\[[^\]]+\]),\s+(\[[^\]]+\])\s+\]/g, "[$1, $2]")
  .replace(/"(\w+)":/g, "$1:")};
`;
mkdirSync(path.join(root, "src", "lib", "mockup"), { recursive: true });
writeFileSync(path.join(root, "src", "lib", "mockup", "photo-data.ts"), ts);
console.log(`Wrote ${Object.keys(data).length} photos.`);
