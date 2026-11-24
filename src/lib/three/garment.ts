import * as THREE from "three";
import type { MockupId, Sleeve } from "@/lib/catalog/types";
import {
  bodyPoint,
  bodySample,
  bottomY,
  HOOD_OPEN,
  hoodPoint,
  sleevePath,
  sleevePoint,
  sleeveRadius,
  specFor,
  topY,
  type GarmentSpec,
  type SleevePath,
  type Vec3,
} from "./shape";
import { knitNormal, ribNormal } from "./textures";

export interface GarmentBuild {
  group: THREE.Group;
  spec: GarmentSpec;
  long: boolean;
  sleeves: { left: SleevePath; right: SleevePath };
  /** Materials that follow the garment color. */
  fabric: THREE.MeshPhysicalMaterial;
  rib: THREE.MeshPhysicalMaterial;
}

type GridFn = (i: number, j: number) => { p: Vec3; uv: [number, number] };

/** A (nu+1)×(nv+1) grid surface. `flip` reverses the facing. */
function grid(nu: number, nv: number, fn: GridFn, flip = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const { p, uv } = fn(i, j);
      pos.push(p[0], p[1], p[2]);
      uvs.push(uv[0], uv[1]);
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
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const edgeDense = (t: number) => Math.sin((-1 + 2 * t) * (Math.PI / 2));

export function fabricMaterial(color: string, rib = false): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.9,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.8,
    sheenColor: c.clone().lerp(new THREE.Color("#ffffff"), 0.2),
    normalMap: rib ? ribNormal() : knitNormal(),
    normalScale: new THREE.Vector2(rib ? 0.9 : 0.4, rib ? 0.9 : 0.4),
    side: THREE.DoubleSide,
  });
  return m;
}

export function setFabricColor(m: THREE.MeshPhysicalMaterial, color: string) {
  m.color.set(color);
  m.sheenColor.copy(m.color).lerp(new THREE.Color("#ffffff"), 0.2);
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

export function buildGarment(mockup: MockupId, sleeve: Sleeve, fitId: string, color: string): GarmentBuild {
  const s = specFor(mockup, fitId);
  const long = sleeve === "long";
  const group = new THREE.Group();
  const fabric = fabricMaterial(color);
  const rib = fabricMaterial(color, true);
  const bot = bottomY(s);

  // Body: front and back panels joined at the side seams and shoulders.
  for (const side of ["front", "back"] as const) {
    const g = grid(
      80,
      110,
      (i, j) => {
        const p = bodyPoint(s, edgeDense(i / 80), j / 110, side);
        return { p, uv: [p[0] / 10, p[1] / 10] };
      },
      side === "back",
    );
    group.add(mesh(g, fabric));
  }

  // Rib waistband.
  if (s.band > 0) {
    for (const side of ["front", "back"] as const) {
      const g = grid(
        80,
        6,
        (i, j) => {
          const u = edgeDense(i / 80) * 0.985;
          const vBand = s.band / s.length;
          const p = bodyPoint(s, u, (vBand * j) / 6, side);
          const n = bodySample(s, p[0], p[1], side).n;
          const lift = 0.35 * Math.sin(Math.PI * Math.min(1, (j / 6) * 1.2 + 0.1));
          return { p: [p[0] + n[0] * lift, p[1], p[2] + n[2] * lift], uv: [p[0] / 8, (p[1] - bot) / s.band] };
        },
        side === "back",
      );
      group.add(mesh(g, rib));
    }
  }

  // Sleeves (+ rib cuffs).
  const frames = { left: sleevePath(s, 1, long), right: sleevePath(s, -1, long) };
  for (const f of [frames.left, frames.right]) {
    const L = f.length;
    const start = -f.shoulder;
    const g = grid(48, 72, (k, i) => {
      const along = start + ((L - start) * i) / 72;
      const theta = (k / 48) * Math.PI * 2;
      const r = sleeveRadius(s, Math.max(0, along) / L, long);
      return { p: sleevePoint(f, along, theta, r), uv: [(theta * r) / 10, along / 10] };
    });
    group.add(mesh(g, fabric));
    if (long && s.cuff > 0) {
      const cg = grid(48, 8, (k, i) => {
        const along = L + (s.cuff * i) / 8;
        const theta = (k / 48) * Math.PI * 2;
        const r = s.wristRadius * (0.9 + 0.03 * Math.sin((i / 8) * Math.PI));
        return { p: sleevePoint(f, along, theta, r), uv: [(theta * r) / 8, i / 8] };
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
    group.add(mesh(tube, rib));
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
      }, sign > 0);
      group.add(mesh(g, rib));
    }
    group.add(mesh(frontRibbon(s, -1.7, 1.7, -s.frontNeckDrop - 0.5, -s.frontNeckDrop - 15, 0.3, 4, 20, (x, y) => [x / 10, y / 10]), fabric));
    const buttonMat = new THREE.MeshPhysicalMaterial({ color: "#efe8d8", roughness: 0.35, clearcoat: 0.5 });
    for (const y of [-s.frontNeckDrop - 4, -s.frontNeckDrop - 8, -s.frontNeckDrop - 12]) addStud(group, s, 0, y, 0.55, 0.3, 0.45, buttonMat);
  }

  // Hood with a rolled edge, drawstrings and metal tips.
  if (s.hood) {
    const g = grid(64, 40, (i, j) => {
      const a = -HOOD_OPEN + (2 * HOOD_OPEN * i) / 64;
      const b = j / 40;
      const p = hoodPoint(s, a, b);
      return { p, uv: [p[0] / 10, p[1] / 10] };
    }, true);
    group.add(mesh(g, fabric));
    const rim: THREE.Vector3[] = [];
    for (let j = 0; j <= 20; j++) rim.push(new THREE.Vector3(...hoodPoint(s, -HOOD_OPEN, j / 20)));
    for (let j = 19; j >= 0; j--) rim.push(new THREE.Vector3(...hoodPoint(s, HOOD_OPEN, j / 20)));
    group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 120, 0.7, 10, false), fabric));

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
    const along = (x: number, y: number) => {
      const { p, n } = bodySample(s, x, y, "front");
      return new THREE.Vector3(p[0] + n[0] * 0.55, p[1] + n[1] * 0.55, p[2] + n[2] * 0.55);
    };
    for (let k = 0; k <= 10; k++) edge.push(along(-18 + 4.5 * (k / 10), yBot + (yTop - yBot) * (k / 10)));
    for (let k = 1; k <= 20; k++) edge.push(along(-13.5 + 27 * (k / 20), yTop));
    for (let k = 1; k <= 10; k++) edge.push(along(13.5 + 4.5 * (k / 10), yTop + (yBot - yTop) * (k / 10)));
    group.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 120, 0.22, 6, false), fabric, false));
  }

  // Zipper.
  if (s.zipper) {
    const zipMat = new THREE.MeshPhysicalMaterial({ color: "#2a2a2a", metalness: 0.7, roughness: 0.35, normalMap: ribNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
    group.add(mesh(frontRibbon(s, -0.6, 0.6, -s.frontNeckDrop, bot + 0.3, 0.7, 2, 60, (x, y) => [y / 1.2, x]), zipMat));
    const pull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.8, 0.4), new THREE.MeshStandardMaterial({ color: "#3a3a3a", metalness: 0.85, roughness: 0.3 }));
    const top = bodySample(s, 0, -s.frontNeckDrop - 2.5, "front");
    pull.position.set(0, top.p[1], top.p[2] + 1);
    group.add(pull);
  }

  // Varsity: snaps, opening line and welt pockets.
  if (s.snaps) {
    const snapMat = new THREE.MeshStandardMaterial({ color: "#d6cfbf", metalness: 0.85, roughness: 0.25 });
    for (let y = -s.frontNeckDrop - 3; y > bot + s.band + 2; y -= 7.5) addStud(group, s, 0, y, 0.65, 0.35, 0.5, snapMat);
    const lineMat = new THREE.MeshStandardMaterial({ color: "#000000", transparent: true, opacity: 0.45 });
    group.add(mesh(frontRibbon(s, -0.12, 0.12, -s.frontNeckDrop, bot, 0.3, 1, 40, () => [0, 0]), lineMat, false));
    const weltMat = new THREE.MeshPhysicalMaterial({ color: "#2b1d1a", roughness: 0.6 });
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

  return { group, spec: s, long, sleeves: frames, fabric, rib };
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
