// Works out where prints land on AI-made 3D garment models, from the front and
// back photos each was made from (src/lib/mockup/photo-data.ts). Prints the
// entries for MODELS in src/lib/three/model.ts.
//
//   node scripts/model-frames.mjs public/models/tshirt-short.glb [more.glb ...]
//
// Each model must be named <mockup>-<sleeve>.glb and made from the photos
// <mockup>-<sleeve>-front and -back.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src", "lib", "mockup", "photo-data.ts"), "utf8");
const PHOTOS = new Function(`return ${source.slice(source.indexOf("= {") + 2).replace(/;\s*$/, "")}`)();

/** The model's bounding box, standing up as three.js shows it (node rotation applied). */
function modelBox(file) {
  const glb = readFileSync(file);
  const json = JSON.parse(glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)));
  const node = json.nodes.find((n) => n.mesh !== undefined) ?? {};
  const prim = json.meshes[node.mesh ?? 0].primitives[0];
  const { min, max } = json.accessors[prim.attributes.POSITION];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const rotate = ([x, y, z]) => {
    // v' = q v q*
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const cx of [min[0], max[0]]) for (const cy of [min[1], max[1]]) for (const cz of [min[2], max[2]]) {
    const p = rotate([cx, cy, cz]);
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i]);
      hi[i] = Math.max(hi[i], p[i]);
    }
  }
  return { lo, hi };
}

const r = (v) => Math.round(v * 10000) / 10000;

for (const file of process.argv.slice(2)) {
  const key = path.basename(file, ".glb");
  const front = PHOTOS[`${key}-front`];
  const back = PHOTOS[`${key}-back`];
  if (!front || !back) throw new Error(`No photos for ${key}`);
  const { lo, hi } = modelBox(file);
  const height = hi[1] - lo[1];
  const centerX = (lo[0] + hi[0]) / 2;
  // The photo's garment fills the same height as the model.
  const up = (photo) => height / (photo.box[3] - photo.box[1]);
  const uf = up(front);
  const ub = up(back);
  const y = (photo, u, py) => hi[1] - (py - photo.box[1]) * u;
  const frontNeck = [r(centerX + (front.neck[0] - (front.box[0] + front.box[2]) / 2) * uf), r(y(front, uf, front.neck[1]))];
  // Seen from behind, the photo's right is the model's left.
  const backNeck = [r(centerX - (back.neck[0] - (back.box[0] + back.box[2]) / 2) * ub), r(y(back, ub, back.neck[1]))];
  const shoulder = front.sleeves ? (front.sleeves.left.p0[1] + front.sleeves.right.p0[1]) / 2 : front.neck[1];
  const frame = {
    front: { neck: frontNeck, perCm: r(front.px * uf) },
    back: { neck: backNeck, perCm: r(back.px * ub) },
    hoodSeamY: back.hood ? r(y(back, ub, back.hood[1] + 11 * back.px)) : r(y(back, ub, back.neck[1])),
    shoulderY: r(y(front, uf, shoulder)),
  };
  console.log(`  "${key}": {\n    file: "${key}.glb",\n    frame: ${JSON.stringify(frame).replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ")},\n  },`);
}
