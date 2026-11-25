import * as THREE from "three";
import type { MockupId, Sleeve } from "@/lib/catalog/types";
import {
  bodyFold,
  bodyPoint,
  bodySample,
  bottomY,
  halfWidthAt,
  HOOD_OPEN,
  hoodPoint,
  sleeveAt,
  sleeveFold,
  sleevePath,
  sleevePoint,
  sleeveRadius,
  smoothstep,
  specFor,
  topY,
  type GarmentSpec,
  type SleevePath,
  type Vec3,
} from "./shape";
import { fabricMottle, feltNormal, fineKnitNormal, piqueNormal, ribNormal, stitchDashes } from "./textures";
import { FULL_TRIMS, type GarmentTrims } from "@/lib/design/options";

export interface GarmentBuild {
  group: THREE.Group;
  spec: GarmentSpec;
  long: boolean;
  sleeves: { left: SleevePath; right: SleevePath };
  /** Materials that follow the garment color. */
  fabric: THREE.MeshPhysicalMaterial;
  rib: THREE.MeshPhysicalMaterial;
  stitch: THREE.MeshStandardMaterial;
}

type GridFn = (i: number, j: number) => { p: Vec3; uv: [number, number]; shade?: number };

/**
 * A (nu+1)×(nv+1) grid surface. `flip` reverses the facing. `shade` (0–1)
 * darkens a point, like the soft shadow in the bottom of a real crease.
 */
function grid(nu: number, nv: number, fn: GridFn, flip = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const { p, uv, shade = 1 } = fn(i, j);
      pos.push(p[0], p[1], p[2]);
      uvs.push(uv[0], uv[1]);
      colors.push(shade, shade, shade);
    }
  }
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (flip) idx.push(a, d, b, a, c, d);
      else idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface FoldedPoint {
  p: Vec3;
  uv: [number, number];
  /** How far the fabric is pushed out by folds here (cm). */
  fold: number;
  /** Extra shading (contact shadows), 1 = none. */
  shade: number;
}

/**
 * A grid whose creases are shaded: a point lower than the fabric around it
 * (the bottom of a fold) gets darker. `reach` is how many grid steps away
 * "around" is, in each direction (about 2 cm).
 */
function foldedGrid(nu: number, nv: number, sample: (i: number, j: number) => FoldedPoint, reach: [number, number], flip = false): THREE.BufferGeometry {
  const pts: FoldedPoint[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pts.push(sample(i, j));
  const at = (i: number, j: number) => pts[Math.min(nv, Math.max(0, j)) * (nu + 1) + Math.min(nu, Math.max(0, i))]!;
  return grid(
    nu,
    nv,
    (i, j) => {
      const c = at(i, j);
      const around = (at(i - reach[0], j).fold + at(i + reach[0], j).fold + at(i, j - reach[1]).fold + at(i, j + reach[1]).fold) / 4;
      return { p: c.p, uv: c.uv, shade: creaseShade(around - c.fold) * c.shade };
    },
    flip,
  );
}

/** Fabric meshes share one material that reads crease shading from vertex colors; plain shapes get none. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(g.getAttribute("position").count * 3).fill(1), 3));
  return g;
}

/** How much darker a point is when it sits below the fabric around it (the bottom of a fold). */
function creaseShade(depth: number): number {
  return 1 - 0.5 * smoothstep(0.02, 0.45, depth);
}

const edgeDense = (t: number) => Math.sin((-1 + 2 * t) * (Math.PI / 2));

/* ---------- Fabric finishes ---------- */

/** How a fabric's surface looks: its knit texture (and how big one tile is), shine and fuzz. */
export interface FabricFinish {
  normal: () => THREE.Texture;
  tileCm: number;
  normalScale: number;
  roughness: number;
  sheen: number;
  sheenRoughness: number;
}

export function fabricFinish(fabricId: string, kind: string): FabricFinish {
  if (fabricId === "pique" || fabricId === "polyPique") {
    const poly = fabricId === "polyPique";
    return { normal: piqueNormal, tileCm: poly ? 0.9 : 1.2, normalScale: 0.75, roughness: poly ? 0.62 : 0.9, sheen: poly ? 0.2 : 0.3, sheenRoughness: 0.7 };
  }
  if (kind === "wool") return { normal: feltNormal, tileCm: 3, normalScale: 0.45, roughness: 0.96, sheen: 0.6, sheenRoughness: 0.9 };
  if (kind === "polyester") return { normal: fineKnitNormal, tileCm: 0.8, normalScale: 0.45, roughness: 0.6, sheen: 0.25, sheenRoughness: 0.5 };
  if (kind === "blend") return { normal: fineKnitNormal, tileCm: 1, normalScale: 0.5, roughness: 0.8, sheen: 0.35, sheenRoughness: 0.7 };
  return { normal: fineKnitNormal, tileCm: 1.2, normalScale: 0.6, roughness: 0.9, sheen: 0.38, sheenRoughness: 0.8 };
}

const DEFAULT_FINISH = fabricFinish("cotton", "cotton");

/** The finish's texture, repeated to its real size (garment UVs are 10 cm per unit). */
function finishMap(f: FabricFinish): THREE.Texture {
  const t = f.normal().clone();
  t.repeat.set(10 / f.tileCm, 10 / f.tileCm);
  t.needsUpdate = true;
  return t;
}

/** Real cotton's faint uneven tone, about 4 cm per tile. */
function mottleMap(): THREE.Texture {
  const t = fabricMottle().clone();
  t.repeat.set(2.5, 2.5);
  t.needsUpdate = true;
  return t;
}

/** The inside of the garment (seen through the neck, hem and sleeve openings) is in shadow, as in a product photo. */
function darkerInside(m: THREE.Material) {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <color_fragment>", "#include <color_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb *= 0.42;")
      .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n\tif (!gl_FrontFacing) material.sheenColor *= 0.3;");
  };
  m.customProgramCacheKey = () => "arcane-fabric";
}

export function fabricMaterial(color: string, rib = false, finish: FabricFinish = DEFAULT_FINISH): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: rib ? 0.9 : finish.roughness,
    metalness: 0,
    sheen: rib ? 0.35 : finish.sheen,
    sheenRoughness: rib ? 0.8 : finish.sheenRoughness,
    sheenColor: c.clone().lerp(new THREE.Color("#ffffff"), 0.2),
    normalMap: rib ? ribNormal() : finishMap(finish),
    map: mottleMap(),
    normalScale: new THREE.Vector2(rib ? 0.9 : finish.normalScale, rib ? 0.9 : finish.normalScale),
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  darkerInside(m);
  return m;
}

/** Switches the knit, shine and fuzz when the customer picks another fabric (no rebuild needed). */
export function applyFinish(m: THREE.MeshPhysicalMaterial, finish: FabricFinish) {
  m.normalMap?.dispose();
  m.normalMap = finishMap(finish);
  m.normalScale.set(finish.normalScale, finish.normalScale);
  m.roughness = finish.roughness;
  m.sheen = finish.sheen;
  m.sheenRoughness = finish.sheenRoughness;
  m.needsUpdate = true;
}

export function setFabricColor(m: THREE.MeshPhysicalMaterial, color: string) {
  m.color.set(color);
  m.sheenColor.copy(m.color).lerp(new THREE.Color("#ffffff"), 0.2);
}

/** Thread a shade off the fabric, so tone-on-tone stitching still reads. */
export function setThreadColor(m: THREE.MeshStandardMaterial, color: string) {
  const c = new THREE.Color(color);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  m.color.copy(c.lerp(new THREE.Color(lum < 0.08 ? "#ffffff" : "#000000"), lum < 0.08 ? 0.1 : 0.2));
}

function stitchMaterial(color: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85, alphaMap: stitchDashes(), alphaTest: 0.5 });
  setThreadColor(m, color);
  return m;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadows = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = shadows;
  out.receiveShadow = true;
  return out;
}

/** Surface strip that follows the front of the body, raised by `lift` cm. */
function frontRibbon(s: GarmentSpec, x0: number, x1: number, y0: number, y1: number, lift: number, nx: number, ny: number, uvFn: (x: number, y: number) => [number, number]) {
  return grid(nx, ny, (i, j) => {
    const x = x0 + ((x1 - x0) * i) / nx;
    const y = y0 + ((y1 - y0) * j) / ny;
    const { p, n } = bodySample(s, x, y, "front");
    return { p: [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift], uv: uvFn(x, y) };
  }, y1 < y0);
}

export function buildGarment(
  mockup: MockupId,
  sleeve: Sleeve,
  fitId: string,
  color: string,
  finish: FabricFinish = DEFAULT_FINISH,
  trims: GarmentTrims = FULL_TRIMS,
): GarmentBuild {
  const s = specFor(mockup, fitId, trims);
  const long = sleeve === "long";
  const group = new THREE.Group();
  const fabric = fabricMaterial(color, false, finish);
  const rib = fabricMaterial(color, true);
  const stitch = stitchMaterial(color);
  const bot = bottomY(s);

  // Body: front and back panels joined at the side seams and shoulders. Points in fold bottoms are a little darker.
  for (const side of ["front", "back"] as const) {
    const g = foldedGrid(
      140,
      130,
      (i, j) => {
        const p = bodyPoint(s, edgeDense(i / 140), j / 130, side);
        const x = p[0];
        const y = p[1];
        const v = j / 130;
        const u = Math.abs(edgeDense(i / 140));
        const byArm = 1 - 0.25 * smoothstep(0.8, 0.98, u) * smoothstep(0.3, 0.55, v) * (1 - smoothstep(0.78, 0.86, v));
        const armhole = 1 - 0.18 * smoothstep(0.86, 0.99, u) * smoothstep(0.8, 0.95, v);
        const collar = Math.abs(x) < s.neckHalf + 2.5 ? 1 - (s.hood ? 0.3 : 0.18) * (1 - smoothstep(0, s.hood ? 4 : 2.2, topY(s, x, side) - y)) : 1;
        return { p, uv: [x / 10, y / 10], fold: bodyFold(s, x, y, side), shade: byArm * armhole * collar };
      },
      [3, 4],
      side === "back",
    );
    group.add(mesh(g, fabric));
  }

  // Rib waistband, a touch darker at the top where the body blouses over it.
  if (s.band > 0) {
    for (const side of ["front", "back"] as const) {
      const g = grid(
        140,
        6,
        (i, j) => {
          const u = edgeDense(i / 140) * 0.985;
          const vBand = s.band / s.length;
          const p = bodyPoint(s, u, (vBand * j) / 6, side);
          const n = bodySample(s, p[0], p[1], side).n;
          const lift = 0.35 * Math.sin(Math.PI * Math.min(1, (j / 6) * 1.2 + 0.1));
          return { p: [p[0] + n[0] * lift, p[1], p[2] + n[2] * lift], uv: [p[0] / 8, (p[1] - bot) / s.band], shade: 1 - 0.22 * smoothstep(0.55, 1, j / 6) };
        },
        side === "back",
      );
      group.add(mesh(g, rib));
    }
  }

  // Sleeves (+ rib cuffs). Fine rows, so the bunching above the cuff stays smooth; darker under the arm.
  const frames = { left: sleevePath(s, 1, long), right: sleevePath(s, -1, long) };
  for (const f of [frames.left, frames.right]) {
    const L = f.length;
    const start = -f.shoulder;
    const rows = long ? 150 : 72;
    const g = foldedGrid(
      56,
      rows,
      (k, i) => {
        const along = start + ((L - start) * i) / rows;
        const theta = (k / 56) * Math.PI * 2;
        const r = sleeveRadius(s, Math.max(0, along) / L, long);
        const p = sleevePoint(f, along, theta, r);
        const c = sleeveAt(f, along).c;
        const inward = Math.max(0, (f.side * (c[0] - p[0])) / r);
        const underarm = (1 - 0.3 * inward * (1 - smoothstep(0, 12, along))) * (1 - 0.15 * (1 - smoothstep(0, 2.5, Math.abs(along))));
        return { p, uv: [(theta * r) / 10, along / 10], fold: sleeveFold(f, along, theta), shade: underarm };
      },
      [2, long ? 4 : 3],
    );
    group.add(mesh(g, fabric));
    if (long && s.cuff > 0) {
      const cg = grid(56, 8, (k, i) => {
        const along = L + (s.cuff * i) / 8;
        const theta = (k / 56) * Math.PI * 2;
        const r = s.wristRadius * (0.9 + 0.03 * Math.sin((i / 8) * Math.PI));
        return { p: sleevePoint(f, along, theta, r), uv: [(theta * r) / 8, i / 8], shade: 1 - 0.18 * (1 - smoothstep(0, 0.35, i / 8)) };
      });
      group.add(mesh(cg, rib));
    }
  }

  // Collar around the neck opening.
  if (s.collar !== "none") {
    const pts: THREE.Vector3[] = [];
    const n = 24;
    for (let k = 0; k <= n; k++) {
      const x = -s.neckHalf + (2 * s.neckHalf * k) / n;
      const y = topY(s, x, "front");
      pts.push(new THREE.Vector3(x, y, bodySample(s, x * 0.98, y - 0.2, "front").p[2]));
    }
    for (let k = n - 1; k > 0; k--) {
      const x = -s.neckHalf + (2 * s.neckHalf * k) / n;
      const y = topY(s, x, "back");
      pts.push(new THREE.Vector3(x, y, bodySample(s, x * 0.98, y - 0.2, "back").p[2]));
    }
    const radius = s.collar === "tee" ? 1.1 : s.collar === "polo" ? 1.3 : 1.8;
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, radius, 12, true);
    group.add(mesh(plain(tube), rib));
  }

  // Polo: collar flaps, placket and buttons.
  if (s.collar === "polo") {
    for (const sign of [-1, 1]) {
      const A: [number, number] = [sign * (s.neckHalf - 0.5), topY(s, sign * (s.neckHalf - 0.5), "front") - 0.3];
      const B: [number, number] = [sign * 0.4, -s.frontNeckDrop - 1.5];
      const C: [number, number] = [sign * 6.5, -s.frontNeckDrop - 8];
      const g = grid(10, 10, (i, j) => {
        const a = i / 10;
        const b = (j / 10) * (1 - a);
        const x = A[0] + (B[0] - A[0]) * a + (C[0] - A[0]) * b;
        const y = A[1] + (B[1] - A[1]) * a + (C[1] - A[1]) * b;
        const { p, n } = bodySample(s, x, y, "front");
        return { p: [p[0] + n[0] * 0.8, p[1] + n[1] * 0.8, p[2] + n[2] * 0.8], uv: [x / 8, y / 8] };
      }, sign < 0); // Both flaps face outward (their inside would be shaded as the garment's inside).
      group.add(mesh(g, rib));
    }
    group.add(mesh(frontRibbon(s, -1.7, 1.7, -s.frontNeckDrop - 0.5, -s.frontNeckDrop - 15, 0.3, 4, 20, (x, y) => [x / 10, y / 10]), fabric));
    const buttonMat = new THREE.MeshPhysicalMaterial({ color: "#efe8d8", roughness: 0.35, clearcoat: 0.5 });
    for (const y of [-s.frontNeckDrop - 4, -s.frontNeckDrop - 8, -s.frontNeckDrop - 12]) addStud(group, s, 0, y, 0.55, 0.3, 0.45, buttonMat);
  }

  // Hood with a rolled edge, drawstrings and metal tips. Its outside is a little darker down by the neck.
  if (s.hood) {
    const g = grid(72, 44, (i, j) => {
      const a = -HOOD_OPEN + (2 * HOOD_OPEN * i) / 72;
      const b = j / 44;
      const p = hoodPoint(s, a, b);
      return { p, uv: [p[0] / 10, p[1] / 10], shade: 1 - 0.2 * (1 - smoothstep(0, 0.25, b)) };
    }, true);
    group.add(mesh(g, fabric));
    const rim: THREE.Vector3[] = [];
    for (let j = 0; j <= 20; j++) rim.push(new THREE.Vector3(...hoodPoint(s, -HOOD_OPEN, j / 20)));
    for (let j = 19; j >= 0; j--) rim.push(new THREE.Vector3(...hoodPoint(s, HOOD_OPEN, j / 20)));
    group.add(mesh(plain(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 120, 0.7, 10, false)), fabric));

    const stringMat = new THREE.MeshPhysicalMaterial({ color: "#efe8d8", roughness: 0.8, sheen: 0.5 });
    const tipMat = new THREE.MeshStandardMaterial({ color: "#b9b2a3", metalness: 0.8, roughness: 0.3 });
    for (const sign of [-1, 1]) {
      const eye = hoodPoint(s, sign * HOOD_OPEN, 0.06);
      const mid = bodySample(s, sign * 4.6, -18, "front");
      const end = bodySample(s, sign * 4.3, -31, "front");
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(eye[0], eye[1] - 0.5, eye[2] + 0.6),
        new THREE.Vector3(mid.p[0], mid.p[1], mid.p[2] + 1.3),
        new THREE.Vector3(end.p[0], end.p[1], end.p[2] + 1.7),
      ]);
      group.add(mesh(new THREE.TubeGeometry(curve, 40, 0.35, 8, false), stringMat));
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 12), tipMat);
      tip.position.set(end.p[0], end.p[1] - 1.1, end.p[2] + 1.7);
      tip.castShadow = true;
      group.add(tip);
    }
  }

  // Kangaroo pocket with a stitched edge.
  if (s.pocket) {
    const yTop = -38;
    const yBot = bot + s.band + 0.4;
    const g = grid(40, 24, (i, j) => {
      const r = j / 24;
      const hw = 13.5 + (18 - 13.5) * r;
      const x = -hw + (2 * hw * i) / 40;
      const y = yTop + (yBot - yTop) * r;
      const { p, n } = bodySample(s, x, y, "front");
      const lift = 0.5;
      return { p: [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift], uv: [x / 10, y / 10] };
    }, true);
    group.add(mesh(g, fabric));
    const edge: THREE.Vector3[] = [];
    const along = (x: number, y: number, lift = 0.55) => {
      const { p, n } = bodySample(s, x, y, "front");
      return new THREE.Vector3(p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift);
    };
    for (let k = 0; k <= 10; k++) edge.push(along(-18 + 4.5 * (k / 10), yBot + (yTop - yBot) * (k / 10)));
    for (let k = 1; k <= 20; k++) edge.push(along(-13.5 + 27 * (k / 20), yTop));
    for (let k = 1; k <= 10; k++) edge.push(along(13.5 + 4.5 * (k / 10), yTop + (yBot - yTop) * (k / 10)));
    group.add(mesh(plain(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 120, 0.22, 6, false)), fabric, false));
    // Topstitching just inside the pocket's opening and top edge.
    const top: Vec3[] = [];
    for (let k = 0; k <= 10; k++) top.push(along(-17.2 + 4.5 * (k / 10), yBot + (yTop + 0.8 - yBot) * (k / 10), 0.6).toArray() as Vec3);
    for (let k = 1; k <= 20; k++) top.push(along(-12.7 + 25.4 * (k / 20), yTop - 0.8, 0.6).toArray() as Vec3);
    for (let k = 1; k <= 10; k++) top.push(along(12.7 + 4.5 * (k / 10), yTop - 0.8 + (yBot - yTop + 0.8) * (k / 10), 0.6).toArray() as Vec3);
    group.add(thread(top, stitch));
  }

  // Zipper, with a line of stitching down each side of its tape.
  if (s.zipper) {
    const zipMat = new THREE.MeshPhysicalMaterial({ color: "#2a2a2a", metalness: 0.7, roughness: 0.35, normalMap: ribNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
    group.add(mesh(frontRibbon(s, -0.6, 0.6, -s.frontNeckDrop, bot + 0.3, 0.7, 2, 60, (x, y) => [y / 1.2, x]), zipMat));
    const pull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.8, 0.4), new THREE.MeshStandardMaterial({ color: "#3a3a3a", metalness: 0.85, roughness: 0.3 }));
    const top = bodySample(s, 0, -s.frontNeckDrop - 2.5, "front");
    pull.position.set(0, top.p[1], top.p[2] + 1);
    group.add(pull);
    for (const x of [-1.5, 1.5]) group.add(thread(line((t) => surface(s, x, -s.frontNeckDrop - 0.5 + (bot + s.band + 0.5 + s.frontNeckDrop) * t, "front"), 60), stitch));
  }

  // Varsity: snaps, opening line and welt pockets.
  if (s.snaps) {
    const snapMat = new THREE.MeshStandardMaterial({ color: "#d6cfbf", metalness: 0.85, roughness: 0.25 });
    for (let y = -s.frontNeckDrop - 3; y > bot + s.band + 2; y -= 7.5) addStud(group, s, 0, y, 0.65, 0.35, 0.5, snapMat);
    const lineMat = new THREE.MeshStandardMaterial({ color: "#000000", transparent: true, opacity: 0.45 });
    group.add(mesh(frontRibbon(s, -0.12, 0.12, -s.frontNeckDrop, bot, 0.3, 1, 40, () => [0, 0]), lineMat, false));
    const weltMat = new THREE.MeshPhysicalMaterial({ color: "#2b1d1a", roughness: 0.6, side: THREE.DoubleSide });
    for (const sign of [-1, 1]) {
      const g = grid(2, 12, (i, j) => {
        const t = j / 12;
        const x = sign * (14 + 3 * t) + (i - 1) * 0.9;
        const y = -34 - 12 * t;
        const { p, n } = bodySample(s, x, y, "front");
        return { p: [p[0] + n[0] * 0.35, p[1] + n[1] * 0.35, p[2] + n[2] * 0.35], uv: [0, 0] };
      }, sign > 0);
      group.add(mesh(g, weltMat, false));
    }
  }

  addSeams(group, s, long, frames, fabric, stitch);
  return { group, spec: s, long, sleeves: frames, fabric, rib, stitch };
}

/* ---------- Seams and stitching ---------- */

/** A point on the body's surface, lifted just off it (cm). */
function surface(s: GarmentSpec, x: number, y: number, side: "front" | "back", lift = 0.07): Vec3 {
  const { p, n } = bodySample(s, x, y, side);
  return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
}

function line(fn: (t: number) => Vec3, steps: number): Vec3[] {
  return Array.from({ length: steps + 1 }, (_, k) => fn(k / steps));
}

/** A dashed line of thread along a curve on the fabric. */
function thread(points: Vec3[], material: THREE.Material, closed = false, radius = 0.05): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
  );
  const length = curve.getLength();
  const g = new THREE.TubeGeometry(curve, Math.max(8, Math.round(length * 2)), radius, 4, closed);
  // One stitch every 3.5 mm.
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * length) / 0.35);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

/** A raised line where two pieces of fabric are sewn together. */
function seamRidge(points: Vec3[], material: THREE.Material, closed = false): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
  );
  const m = new THREE.Mesh(plain(new THREE.TubeGeometry(curve, Math.max(12, Math.round(curve.getLength() * 1.5)), 0.13, 6, closed)), material);
  m.receiveShadow = true;
  return m;
}

/** Where pieces are sewn: armholes, shoulders, sides, hems, cuffs and the waistband, as on a real garment. */
function addSeams(
  group: THREE.Group,
  s: GarmentSpec,
  long: boolean,
  frames: { left: SleevePath; right: SleevePath },
  fabricMat: THREE.Material,
  stitch: THREE.Material,
) {
  const bot = bottomY(s);
  const ring = (f: SleevePath, along: number, lift: number): Vec3[] =>
    line((t) => sleevePoint(f, along, t * Math.PI * 2, sleeveRadius(s, Math.max(0, along) / f.length, long) + lift), 56);

  for (const f of [frames.left, frames.right]) {
    // Armhole: where the sleeve is sewn to the body.
    group.add(seamRidge(ring(f, 0.4, 0.02), fabricMat, true));
    if (long && s.cuff > 0) {
      // Where the sleeve gathers into the rib cuff.
      group.add(thread(ring(f, f.length - 0.35, 0.06), stitch, true));
    } else {
      // A short sleeve's hem: two rows of stitching.
      group.add(thread(ring(f, f.length - 1.6, 0.06), stitch, true));
      group.add(thread(ring(f, f.length - 2.2, 0.06), stitch, true));
    }
  }

  // Shoulder seams, from the neck to the top of the sleeve.
  for (const sign of [-1, 1]) {
    const x0 = sign * (s.neckHalf + 0.8);
    const x1 = sign * (s.shoulderHalf - 0.5);
    group.add(seamRidge(line((t) => {
      const x = x0 + (x1 - x0) * t;
      return [x, topY(s, x, "front") + 0.05, 0];
    }, 16), fabricMat));
  }

  // Side seams, from under the arm down to the hem or band.
  const armpitY = -s.shoulderDrop - s.armRadius * 1.6;
  const lowY = bot + s.band + 0.3;
  for (const sign of [-1, 1]) {
    group.add(seamRidge(line((t) => {
      const y = armpitY + (lowY - armpitY) * t;
      const v = (y - bot) / s.length;
      return [sign * halfWidthAt(s, v), y, 0];
    }, 30), fabricMat));
  }

  for (const side of ["front", "back"] as const) {
    const across = (y: number, steps = 60) =>
      line((t) => {
        const v = (y - bot) / s.length;
        const hw = halfWidthAt(s, v) * 0.985;
        return surface(s, -hw + 2 * hw * t, y, side);
      }, steps);
    if (s.band > 0) {
      // Where the body is sewn to the waistband.
      group.add(thread(across(bot + s.band + 0.3), stitch));
    } else {
      // A plain hem: two rows of stitching.
      group.add(thread(across(bot + 1.6), stitch));
      group.add(thread(across(bot + 2.2), stitch));
    }
  }

  // Around the neck, just under a collar.
  if (s.collar === "tee" || s.collar === "rib") {
    const drop = s.collar === "tee" ? 1.6 : 2.3;
    for (const side of ["front", "back"] as const) {
      group.add(thread(line((t) => {
        const x = (-s.neckHalf - 0.6) + (2 * s.neckHalf + 1.2) * t;
        return surface(s, x, topY(s, x * 0.97, side) - drop, side);
      }, 40), stitch));
    }
  }

  // Along the hood's opening, just inside its rolled edge.
  if (s.hood) {
    for (const sign of [-1, 1]) {
      group.add(thread(line((t) => hoodPoint(s, sign * (HOOD_OPEN - 0.1), 0.04 + 0.92 * t), 30), stitch));
    }
  }
}

function addStud(group: THREE.Group, s: GarmentSpec, x: number, y: number, r: number, h: number, lift: number, m: THREE.Material) {
  const { p, n } = bodySample(s, x, y, "front");
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), m);
  stud.position.set(p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift);
  stud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n[0], n[1], n[2]));
  stud.castShadow = true;
  group.add(stud);
}

export function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.dispose();
    }
  });
}
