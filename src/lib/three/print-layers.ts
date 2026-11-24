import * as THREE from "three";
import type { Catalog, SizeTier } from "@/lib/catalog/types";
import { tierBoxCm } from "@/lib/design/geometry";
import { placementOf } from "@/lib/design/placement";
import type { DesignSelection, PersonalStyle } from "@/lib/pricing/types";
import { disposeGroup, type GarmentBuild } from "./garment";
import { drawNamesList, drawNeckLabel, drawPersonalText, drawPrintCanvas, placeholderCanvas, type PatchStyle } from "./print-canvas";
import { bodySample, HOOD_HEIGHT, HOOD_OPEN, hoodPoint, sleeveAt, sleevePoint, sleevePrintTheta, sleeveRadius, type GarmentSpec, type Vec3 } from "./shape";
import type { GarmentStage } from "./stage";
import { chenilleNormal, glitterNormal, knitNormal, threadNormal, weaveNormal } from "./textures";

/**
 * How each print method looks on fabric. Heights are in cm above the fabric:
 * puff and 3D embroidery rise visibly, embroidery shows thread, vinyl is
 * glossy, special vinyl is metallic with glitter, DTG and sublimation soak
 * into the knit, patches are raised with a stitched edge.
 */
interface Look {
  height: number;
  blur: number;
  roughness: number;
  metalness?: number;
  clearcoat?: number;
  sheen?: number;
  normal?: () => THREE.Texture;
  normalScale?: number;
  soak?: boolean;
  patch?: PatchStyle;
}

const LOOKS: Record<string, Look> = {
  dtf: { height: 0.06, blur: 0, roughness: 0.42, clearcoat: 0.35 },
  dtg: { height: 0, blur: 0, roughness: 0.95, soak: true },
  screen: { height: 0.035, blur: 0, roughness: 0.72 },
  puff: { height: 0.45, blur: 3, roughness: 0.82, sheen: 0.25 },
  embroidery: { height: 0.16, blur: 1, roughness: 0.38, sheen: 0.9, normal: threadNormal, normalScale: 1.4 },
  embroidery3d: { height: 0.55, blur: 3, roughness: 0.38, sheen: 0.9, normal: threadNormal, normalScale: 1.4 },
  sublimation: { height: 0, blur: 0, roughness: 0.92, soak: true },
  vinyl: { height: 0.07, blur: 0, roughness: 0.26, clearcoat: 0.75 },
  vinylSpecial: { height: 0.07, blur: 0, roughness: 0.22, metalness: 0.85, normal: glitterNormal, normalScale: 0.7 },
  wovenPatch: { height: 0.18, blur: 1, roughness: 0.7, normal: weaveNormal, normalScale: 0.8, patch: "woven" },
  chenillePatch: { height: 0.4, blur: 2, roughness: 1, sheen: 1, normal: chenilleNormal, normalScale: 1.6, patch: "chenille" },
};

export function lookFor(methodId: string): Look {
  return LOOKS[methodId] ?? LOOKS.dtf!;
}

type Surface = { kind: "front" } | { kind: "back" } | { kind: "sleeve"; side: 1 | -1 } | { kind: "hood" };

interface Placement {
  surface: Surface;
  /** Horizontal center (cm) as seen when looking at that side. */
  cx: number;
  /** Top edge: y (cm) on the body or hood, distance from the shoulder on sleeves. */
  top: number;
}

/** Where each print area sits on the 3D garment (the same measurements the workshop sheet prints). */
function placementFor(s: GarmentSpec, areaId: string, long: boolean): Placement | null {
  const p = placementOf(areaId, long ? "long" : "short");
  if (!p) return null;
  switch (p.from) {
    case "frontNeck":
      return { surface: { kind: "front" }, cx: p.sideCm, top: -s.frontNeckDrop - p.downCm };
    case "backNeck":
      return { surface: { kind: "back" }, cx: p.sideCm, top: -s.backNeckDrop - p.downCm };
    case "hoodSeam":
      return s.hood ? { surface: { kind: "hood" }, cx: 0, top: p.downCm } : null;
    case "shoulder":
      return { surface: { kind: "sleeve", side: p.sleeve ?? 1 }, cx: 0, top: p.downCm };
  }
}

type Sampler = (x: number, y: number) => { p: Vec3; n: Vec3 };

/** Maps print coordinates (x right, y down from the top edge, cm) to a point and normal on the garment. */
function samplerFor(build: GarmentBuild, pl: Placement): Sampler {
  const s = build.spec;
  const surf = pl.surface;
  if (surf.kind === "front") return (x, y) => bodySample(s, pl.cx + x, pl.top - y, "front");
  if (surf.kind === "back") return (x, y) => bodySample(s, -(pl.cx + x), pl.top - y, "back");
  if (surf.kind === "sleeve") {
    const path = surf.side === 1 ? build.sleeves.left : build.sleeves.right;
    const mid = pl.top + 8;
    const theta0 = sleevePrintTheta(path, mid);
    // Make "right" in the artwork point toward the viewer's right when seen from the front.
    const f = sleeveAt(path, mid);
    const tangentX = -Math.sin(theta0) * f.n1[0] + Math.cos(theta0) * f.b[0];
    const dir = tangentX >= 0 ? 1 : -1;
    return (x, y) => {
      const along = pl.top + y;
      const r = sleeveRadius(s, along / path.length, build.long);
      const theta = theta0 + (dir * (pl.cx + x)) / r;
      const p = sleevePoint(path, along, theta, r);
      const c = sleeveAt(path, along).c;
      const n: Vec3 = [(p[0] - c[0]) / r, (p[1] - c[1]) / r, (p[2] - c[2]) / r];
      return { p, n };
    };
  }
  // Hood: seen from behind, so the artwork's right is the wearer's right.
  return (x, y) => {
    const wx = -(pl.cx + x);
    const yy = pl.top - y;
    const b = Math.min(0.98, Math.max(0.02, (2 / Math.PI) * Math.asin(Math.min(1, Math.max(-1, (yy + 2.5) / HOOD_HEIGHT)))));
    let lo = -HOOD_OPEN * 0.6;
    let hi = HOOD_OPEN * 0.6;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (hoodPoint(s, mid, b)[0] < wx) lo = mid;
      else hi = mid;
    }
    const a = (lo + hi) / 2;
    const p = hoodPoint(s, a, b);
    const pa = hoodPoint(s, a + 0.01, b);
    const pb = hoodPoint(s, a, Math.min(1, b + 0.01));
    const da: Vec3 = [pa[0] - p[0], pa[1] - p[1], pa[2] - p[2]];
    const db: Vec3 = [pb[0] - p[0], pb[1] - p[1], pb[2] - p[2]];
    let n: Vec3 = [da[1] * db[2] - da[2] * db[1], da[2] * db[0] - da[0] * db[2], da[0] * db[1] - da[1] * db[0]];
    const len = Math.hypot(...n) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (n[2] > 0) n = [-n[0], -n[1], -n[2]];
    return { p, n };
  };
}

/** Alpha of the artwork on a coarse grid, softened so raised prints slope at the edges. */
function heightGrid(canvas: HTMLCanvasElement, nx: number, ny: number, blur: number, solid: boolean): Float32Array {
  const w = nx + 1;
  const h = ny + 1;
  const out = new Float32Array(w * h);
  if (solid) {
    out.fill(1);
  } else {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) out[i] = d[i * 4 + 3]! / 255;
  }
  for (let pass = 0; pass < blur; pass++) {
    const tmp = Float32Array.from(out);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            sum += tmp[yy * w + xx]!;
            n++;
          }
        }
        out[y * w + x] = sum / n;
      }
    }
  }
  // Patch edges fall off toward the border.
  if (solid) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const e = Math.min(x, y, w - 1 - x, h - 1 - y) / 2;
        out[y * w + x] = Math.min(1, e);
      }
    }
  }
  return out;
}

function buildPrintMesh(build: GarmentBuild, pl: Placement, wCm: number, hCm: number, canvas: HTMLCanvasElement, look: Look, lift = 0.1): THREE.Mesh {
  const sample = samplerFor(build, pl);
  const nx = Math.min(170, Math.max(16, Math.round(wCm * 5)));
  const ny = Math.min(230, Math.max(16, Math.round(hCm * 5)));
  const heights = look.height > 0 ? heightGrid(canvas, nx, ny, look.blur, Boolean(look.patch)) : null;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -wCm / 2 + (wCm * i) / nx;
      const y = (hCm * j) / ny;
      const { p, n } = sample(x, y);
      const h = heights ? Math.pow(heights[j * (nx + 1) + i]!, 0.85) * look.height : 0;
      const d = lift + h;
      pos.push(p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d);
      uvs.push(i / nx, 1 - j / ny);
    }
  }
  const row = nx + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      idx.push(a, a + row + 1, a + 1, a, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  let normalMap: THREE.Texture | null = null;
  if (look.normal) {
    normalMap = look.normal().clone();
    normalMap.repeat.set(wCm / 4, hCm / 4);
    normalMap.needsUpdate = true;
  } else if (look.soak) {
    normalMap = knitNormal().clone();
    normalMap.repeat.set(wCm / 10, hCm / 10);
    normalMap.needsUpdate = true;
  }
  const material = new THREE.MeshPhysicalMaterial({
    map,
    transparent: true,
    alphaTest: 0.04,
    roughness: look.roughness,
    metalness: look.metalness ?? 0,
    clearcoat: look.clearcoat ?? 0,
    clearcoatRoughness: 0.35,
    sheen: look.sheen ?? 0,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color("#ffffff"),
    normalMap,
    normalScale: new THREE.Vector2(look.normalScale ?? 0.45, look.normalScale ?? 0.45),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.FrontSide,
  });
  const m = new THREE.Mesh(g, material);
  m.castShadow = look.height > 0.12;
  m.receiveShadow = true;
  return m;
}

/** The middle of a print area on the 3D garment and the way it faces (where the close-up callout points). */
export function areaAnchor(build: GarmentBuild, catalog: Catalog, areaId: string, tier: SizeTier): { p: Vec3; n: Vec3 } | null {
  const area = catalog.printAreas.find((a) => a.id === areaId);
  const pl = area ? placementFor(build.spec, area.id, build.long) : null;
  if (!area || !pl) return null;
  const [, hCm] = tierBoxCm(area, tier);
  return samplerFor(build, pl)(0, hCm / 2);
}

export interface PrintSamples {
  name?: string;
  number?: string;
}

const versions = new WeakMap<GarmentStage, number>();

/** Rebuilds every print, name and number on the 3D garment. Older, slower updates are dropped. */
export async function updatePrintLayers(
  stage: GarmentStage,
  catalog: Catalog,
  design: DesignSelection,
  opts: { placeholders?: boolean; samples?: PrintSamples; nameFallback?: string; numberFallback?: string } = {},
): Promise<void> {
  const build = stage.garment;
  if (!build) return;
  const version = (versions.get(stage) ?? 0) + 1;
  versions.set(stage, version);
  const meshes: THREE.Mesh[] = [];

  for (const print of design.prints) {
    const area = catalog.printAreas.find((a) => a.id === print.areaId);
    const pl = area ? placementFor(build.spec, area.id, build.long) : null;
    if (!area || !pl) continue;
    const [wCm, hCm] = tierBoxCm(area, print.tier);
    const look = lookFor(print.methodId);
    const elements = print.elements ?? [];
    let canvas: HTMLCanvasElement | null = null;
    if (elements.length || look.patch) canvas = await drawPrintCanvas(elements, wCm * 10, hCm * 10, look.patch ?? null);
    else if (opts.placeholders) canvas = placeholderCanvas(wCm * 10, hCm * 10);
    if (!canvas) continue;
    meshes.push(buildPrintMesh(build, pl, wCm, hCm, canvas, elements.length || look.patch ? look : { height: 0, blur: 0, roughness: 0.9 }));
  }

  const p = design.personalization;
  const personal = async (style: PersonalStyle | undefined, draw: (w: number, h: number) => Promise<HTMLCanvasElement>, methodId: string) => {
    if (!style) return;
    const area = catalog.printAreas.find((a) => a.id === style.areaId);
    const pl = area ? placementFor(build.spec, area.id, build.long) : null;
    if (!area || !pl) return;
    const canvas = await draw(area.widthCm * 10, area.heightCm * 10);
    meshes.push(buildPrintMesh(build, pl, area.widthCm, area.heightCm, canvas, lookFor(methodId), 0.16));
  };
  if (p.namesList) await personal(p.namesListStyle, (w, h) => drawNamesList(p.namesListNames ?? [], p.namesListStyle!, w, h), "screen");
  if (p.numbers) await personal(p.numberStyle, (w, h) => drawPersonalText(opts.samples?.number || opts.numberFallback || "10", p.numberStyle!, w, h), "vinyl");
  if (p.names) await personal(p.nameStyle, (w, h) => drawPersonalText(opts.samples?.name || opts.nameFallback || "YOUR NAME", p.nameStyle!, w, h), "vinyl");
  if (p.neckLabel) {
    const s = build.spec;
    const label = buildPrintMesh(build, { surface: { kind: "back" }, cx: 0, top: -s.backNeckDrop - 1.5 }, 5, 2, drawNeckLabel(p.neckLabelText ?? ""), { height: 0, blur: 0, roughness: 0.7 }, -0.25);
    (label.material as THREE.MeshPhysicalMaterial).side = THREE.BackSide;
    meshes.push(label);
  }

  if (versions.get(stage) !== version || stage.garment !== build) {
    for (const m of meshes) disposeGroup(m);
    return;
  }
  const old = [...stage.prints.children];
  stage.prints.clear();
  for (const o of old) disposeGroup(o);
  for (const m of meshes) stage.prints.add(m);
  stage.requestRender();
}
