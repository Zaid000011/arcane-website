// Makes an AI-generated 3D garment (GLB) light enough for the website:
// its texture becomes a smaller JPEG. The mesh itself is kept as it is.
//
//   node scripts/shrink-glb.mjs <in.glb> <out.glb> [texture size, default 2048]
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(path.join(root, "package.json"))("sharp");

const [input, output, sizeArg] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/shrink-glb.mjs <in.glb> <out.glb> [texture size]");
const size = Number(sizeArg ?? 2048);

const glb = readFileSync(input);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error("Not a GLB file");
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
const binStart = 20 + jsonLength + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLength));

// Each buffer view's bytes, so the texture's can be swapped.
const views = gltf.bufferViews.map((v) => bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
for (const image of gltf.images ?? []) {
  const before = views[image.bufferView].length;
  views[image.bufferView] = await sharp(views[image.bufferView]).resize(size, size, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  image.mimeType = "image/jpeg";
  console.log(`texture ${Math.round(before / 1024)} KB -> ${Math.round(views[image.bufferView].length / 1024)} KB`);
}

// Put the binary back together, 4-byte aligned.
const parts = [];
let offset = 0;
gltf.bufferViews.forEach((v, i) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) parts.push(Buffer.alloc(pad));
  offset += pad;
  v.byteOffset = offset;
  v.byteLength = views[i].length;
  parts.push(views[i]);
  offset += views[i].length;
});
const newBin = Buffer.concat([...parts, Buffer.alloc((4 - (offset % 4)) % 4)]);
gltf.buffers = [{ byteLength: newBin.length }];

let json = Buffer.from(JSON.stringify(gltf), "utf8");
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + newBin.length, 8);
const chunk = (type, body) => {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(body.length, 0);
  h.writeUInt32LE(type, 4);
  return Buffer.concat([h, body]);
};
writeFileSync(output, Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, newBin)]));
console.log(`${path.basename(output)}: ${Math.round(glb.length / 1024)} KB -> ${Math.round((12 + 16 + json.length + newBin.length) / 1024)} KB`);
