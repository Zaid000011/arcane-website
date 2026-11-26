import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MockupId, Sleeve } from "@/lib/catalog/types";
import { fitKey } from "@/lib/design/options";
import type { RectPlacement } from "@/lib/design/sides";
import { recolorPixels } from "@/lib/mockup/shade";
import { STATIC_ROOT } from "@/lib/site-mode";
import { clamp, specFor, type Vec3 } from "./shape";

/**
 * Real 3D garments, made with AI from the same product photos the photo view
 * uses (public/models, made smaller by scripts/shrink-glb.mjs). They're
 * recolored with the same light-and-shadow math as the photos, and prints are
 * pressed onto their surface where the photos and the workshop sheet put them.
 */

interface ModelFrame {
  /** Middle of the front neckline (x to the viewer's right from the front, y up) and model units per cm there. */
  front: { neck: [number, number]; perCm: number };
  /** Middle of the back neckline and units per cm on the back. */
  back: { neck: [number, number]; perCm: number };
  /** Height of the hood's neck seam at the back. */
  hoodSeamY: number;
  /** Height of the shoulder seams at the top of the sleeves. */
  shoulderY: number;
}

/**
 * Measured on the photos each model was made from: the hoodie's hood-up front
 * (neckline at 653 px of 2048, 19.3 px per cm) and back (neckline 571 px,
 * 18.8 px per cm), mapped onto the model's 1.028-unit height. The zip hoodie
 * the same way (mockups-src/zipHoodie-long-front-hoodup and -back-hoodup:
 * necklines at 648 and 545 px, 19.16 and 18.97 px per cm, shoulders 718 px).
 */
const MODELS: Partial<Record<string, { file: string; frame: ModelFrame }>> = {
  "hoodie-long": {
    file: "hoodie-long.glb",
    frame: { front: { neck: [0, 0.707], perCm: 0.00981 }, back: { neck: [0, 0.748], perCm: 0.0096 }, hoodSeamY: 0.762, shoulderY: 0.689 },
  },
  "zipHoodie-long": {
    file: "zipHoodie-long.glb",
    frame: { front: { neck: [0.0053, 0.6975], perCm: 0.0097 }, back: { neck: [0.0046, 0.7471], perCm: 0.0096 }, hoodSeamY: 0.7471, shoulderY: 0.6621 },
  },
  // The rest come from their own front and back photos: `node scripts/model-frames.mjs public/models/<name>.glb`.
  "tshirt-short": {
    file: "tshirt-short.glb",
    frame: { front: { neck: [-0.0034, 0.9093], perCm: 0.0125 }, back: { neck: [0.0108, 1.0077], perCm: 0.0128 }, hoodSeamY: 1.0077, shoulderY: 0.9222 },
  },
  "tshirt-long": {
    file: "tshirt-long.glb",
    frame: { front: { neck: [-0.0014, 0.7732], perCm: 0.0106 }, back: { neck: [-0.0003, 0.8486], perCm: 0.0107 }, hoodSeamY: 0.8486, shoulderY: 0.7796 },
  },
  "polo-short": {
    file: "polo-short.glb",
    frame: { front: { neck: [-0.0095, 0.9257], perCm: 0.012 }, back: { neck: [0.0067, 1.0138], perCm: 0.0127 }, hoodSeamY: 1.0138, shoulderY: 0.9214 },
  },
  "polo-long": {
    file: "polo-long.glb",
    frame: { front: { neck: [-0.0038, 0.8352], perCm: 0.0108 }, back: { neck: [-0.0035, 0.9155], perCm: 0.0115 }, hoodSeamY: 0.9155, shoulderY: 0.8302 },
  },
  "sweatshirt-long": {
    file: "sweatshirt-long.glb",
    frame: { front: { neck: [0.0003, 0.8143], perCm: 0.0118 }, back: { neck: [0.0001, 0.896], perCm: 0.012 }, hoodSeamY: 0.896, shoulderY: 0.8269 },
  },
  "varsity-long": {
    file: "varsity-long.glb",
    frame: { front: { neck: [0.0043, 0.7914], perCm: 0.012 }, back: { neck: [0.0041, 0.874], perCm: 0.0118 }, hoodSeamY: 0.874, shoulderY: 0.7774 },
  },
};

export function hasModel(mockup: MockupId, sleeve: Sleeve): boolean {
  return Boolean(MODELS[`${mockup}-${sleeve}`]);
}

export interface ModelBuild {
  key: string;
  group: THREE.Group;
  mesh: THREE.Mesh;
  /** The frame in the model's own units (scaled so 1 unit = 1 cm on the front). */
  frame: ModelFrame;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  source: { pixels: ImageData; white: number };
  color: string;
}

interface Source {
  geometry: THREE.BufferGeometry;
  pixels: ImageData;
  white: number;
}

const sources = new Map<string, Promise<Source>>();

/** Loads a model once: its shape (in cm, standing up) and its white texture. */
function loadSource(key: string): Promise<Source> {
  let p = sources.get(key);
  if (p) return p;
  const entry = MODELS[key]!;
  p = new GLTFLoader().loadAsync(`${STATIC_ROOT}/models/${entry.file}`).then((gltf) => {
    let mesh: THREE.Mesh | null = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) throw new Error("No mesh in the model");
    const m = mesh as THREE.Mesh;
    const scale = 1 / entry.frame.front.perCm;
    const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld).scale(scale, scale, scale);
    const map = (m.material as THREE.MeshStandardMaterial).map;
    const image = map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!image) throw new Error("No texture on the model");
    const size = Math.min(1024, image.width);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size);
    // Well-lit fabric: brighter than 90% of the garment (the dark unused parts of the texture left out).
    const lum: number[] = [];
    for (let i = 0; i < pixels.data.length; i += 4 * 7) {
      const l = 0.2126 * pixels.data[i]! + 0.7152 * pixels.data[i + 1]! + 0.0722 * pixels.data[i + 2]!;
      if (l > 40) lum.push(l);
    }
    lum.sort((a, b) => a - b);
    const white = lum[Math.floor(lum.length * 0.9)] ?? 230;
    map?.dispose();
    (m.material as THREE.Material).dispose();
    return { geometry, pixels, white };
  });
  p.catch(() => sources.delete(key));
  sources.set(key, p);
  return p;
}

const frameIn = (f: ModelFrame, s: number): ModelFrame => ({
  front: { neck: [f.front.neck[0] * s, f.front.neck[1] * s], perCm: f.front.perCm * s },
  back: { neck: [f.back.neck[0] * s, f.back.neck[1] * s], perCm: f.back.perCm * s },
  hoodSeamY: f.hoodSeamY * s,
  shoulderY: f.shoulderY * s,
});

/**
 * Makes a model the cut of an oversized or boxy fit: wider outside the neck
 * opening, and longer or shorter below the front neckline, by as much as the
 * drawn garment changes for that fit (specFor). The collar or hood stays as it
 * is, and the change eases in over a few cm so no crease shows. Returns the
 * frame moved to match (in cm, like the geometry).
 */
function reshapeForFit(geometry: THREE.BufferGeometry, frame: ModelFrame, mockup: MockupId, fitId: string): ModelFrame {
  if (!fitKey(fitId)) return frame;
  const a = specFor(mockup, "regular");
  const b = specFor(mockup, fitId);
  // The models' units are the photos' print cm, a little bigger than real cm (PRINT_SCALE 0.88 in scripts/mockup-photos.mjs).
  const k = 1 / 0.88;
  const ease = 6;
  const inner = a.neckHalf * k;
  // Extra units per unit outside the neck opening, and below the front neckline.
  const wide = (Math.max(0, b.chestHalf - a.chestHalf) * k) / Math.max(1, a.chestHalf * k - inner - ease / 2);
  const long = ((b.length - a.length) * k) / Math.max(1, (a.length - a.frontNeckDrop) * k - ease / 2);
  const deep = wide * 0.4;
  const ramp = (u: number) => (u <= 0 ? 0 : u >= ease ? u - ease / 2 : (u * u) / (2 * ease));
  const slope = (u: number) => clamp(u / ease, 0, 1);
  const [neckX, neckY] = frame.front.neck;
  geometry.computeBoundingBox();
  const zMid = (geometry.boundingBox!.min.z + geometry.boundingBox!.max.z) / 2;
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const nrm = geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - neckX;
    const y = pos.getY(i);
    const ux = Math.abs(x) - inner;
    const uy = neckY - y;
    pos.setXYZ(i, neckX + x + Math.sign(x) * wide * ramp(ux), y - long * ramp(uy), zMid + (pos.getZ(i) - zMid) * (1 + deep));
    if (nrm) {
      // A surface stretched along an axis turns away from it: divide by the stretch.
      n.set(nrm.getX(i) / (1 + wide * slope(ux)), nrm.getY(i) / (1 + long * slope(uy)), nrm.getZ(i) / (1 + deep)).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
    }
  }
  pos.needsUpdate = true;
  if (nrm) nrm.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { ...frame, shoulderY: frame.shoulderY - long * ramp(neckY - frame.shoulderY) };
}

/** A fresh copy of a garment model in a color and fit, or null when there's no model for it. */
export async function buildModel(mockup: MockupId, sleeve: Sleeve, color: string, fitId = "regular"): Promise<ModelBuild | null> {
  const key = `${mockup}-${sleeve}`;
  const entry = MODELS[key];
  if (!entry) return null;
  const source = await loadSource(key);
  const canvas = document.createElement("canvas");
  canvas.width = source.pixels.width;
  canvas.height = source.pixels.height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const geometry = source.geometry.clone();
  const frame = reshapeForFit(geometry, frameIn(entry.frame, 1 / entry.frame.front.perCm), mockup, fitId);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  const build: ModelBuild = { key: `${key}${fitKey(fitId)}`, group, mesh, frame, canvas, texture, source, color: "" };
  recolorModel(build, color);
  return build;
}

/** Paints the model's fabric in a color, keeping its folds and knit. */
export function recolorModel(build: ModelBuild, color: string): void {
  if (build.color === color) return;
  const { pixels, white } = build.source;
  const data = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  recolorPixels(data.data, white, color);
  build.canvas.getContext("2d")!.putImageData(data, 0, 0);
  build.texture.needsUpdate = true;
  build.color = color;
}

const ray = new THREE.Raycaster();

/** Where a print's middle lands on the model's surface, how to face it, and the units per cm there. */
function surfaceSpot(build: ModelBuild, rp: RectPlacement) {
  const f = build.frame;
  let origin: THREE.Vector3;
  let dir: THREE.Vector3;
  let turn: number;
  let perCm = 1;
  switch (rp.side) {
    case "front":
      origin = new THREE.Vector3(f.front.neck[0] + rp.cxCm, f.front.neck[1] - (rp.topCm + rp.hCm / 2), 1000);
      dir = new THREE.Vector3(0, 0, -1);
      turn = 0;
      break;
    case "back":
      // Seen from behind, the viewer's right is the model's −x.
      perCm = f.back.perCm;
      origin = new THREE.Vector3(f.back.neck[0] - rp.cxCm * perCm, f.back.neck[1] - (rp.topCm + rp.hCm / 2) * perCm, -1000);
      dir = new THREE.Vector3(0, 0, 1);
      turn = Math.PI;
      break;
    case "hood":
      perCm = f.back.perCm;
      origin = new THREE.Vector3(-rp.cxCm * perCm, f.hoodSeamY + (rp.topCm - rp.hCm / 2) * perCm, -1000);
      dir = new THREE.Vector3(0, 0, 1);
      turn = Math.PI;
      break;
    case "leftSleeve":
      // From outside the left sleeve, the artwork's right points to the back.
      origin = new THREE.Vector3(1000, f.shoulderY - (rp.topCm + rp.hCm / 2), -rp.cxCm);
      dir = new THREE.Vector3(-1, 0, 0);
      turn = Math.PI / 2;
      break;
    case "rightSleeve":
      origin = new THREE.Vector3(-1000, f.shoulderY - (rp.topCm + rp.hCm / 2), rp.cxCm);
      dir = new THREE.Vector3(1, 0, 0);
      turn = -Math.PI / 2;
      break;
  }
  ray.set(origin, dir);
  const hit = ray.intersectObject(build.mesh, false)[0];
  if (!hit) return null;
  return { hit, turn, perCm, out: dir.clone().negate() };
}

/** The middle of a print on the model and the way it faces (where the close-up callout points). */
export function modelAnchor(build: ModelBuild, rp: RectPlacement): { p: Vec3; n: Vec3 } | null {
  const spot = surfaceSpot(build, rp);
  if (!spot) return null;
  // The side the print was laid from (the model's own normals may point either way).
  const n = spot.out;
  const p = spot.hit.point;
  return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
}

/** How a print method's surface looks on the model. */
export interface DecalLook {
  roughness: number;
  metalness?: number;
  clearcoat?: number;
  sheen?: number;
}

/** A print pressed onto the model's surface, or null when it misses the garment. */
export function modelDecal(build: ModelBuild, rp: RectPlacement, canvas: HTMLCanvasElement, look: DecalLook, order = 0): THREE.Mesh | null {
  const spot = surfaceSpot(build, rp);
  if (!spot) return null;
  build.mesh.updateMatrixWorld(true);
  // Deep enough to follow folds, shallow enough on a sleeve not to reach the body under the arm.
  const sleeve = rp.side === "leftSleeve" || rp.side === "rightSleeve";
  const size = new THREE.Vector3(rp.wCm * spot.perCm, rp.hCm * spot.perCm, sleeve ? 8 : 14);
  const geometry = new DecalGeometry(build.mesh, spot.hit.point, new THREE.Euler(0, spot.turn, 0), size);
  if (!geometry.getAttribute("position")?.count) {
    geometry.dispose();
    return null;
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const material = new THREE.MeshPhysicalMaterial({
    map,
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    roughness: look.roughness,
    metalness: look.metalness ?? 0,
    clearcoat: look.clearcoat ?? 0,
    clearcoatRoughness: 0.35,
    sheen: look.sheen ?? 0,
    sheenRoughness: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -4 - order,
    polygonOffsetUnits: -4 - order,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2 + order;
  mesh.receiveShadow = true;
  return mesh;
}
