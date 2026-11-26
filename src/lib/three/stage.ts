import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { MockupId, Sleeve } from "@/lib/catalog/types";
import { applyFinish, buildGarment, disposeGroup, fabricFinish, setFabricColor, setThreadColor, type GarmentBuild } from "./garment";
import { buildModel, hasModel, recolorModel, type ModelBuild } from "./model";
import type { Vec3 } from "./shape";
import { groundShadow } from "./textures";
import { FULL_TRIMS, fitKey, hasFullTrims, trimsKey, type GarmentTrims } from "@/lib/design/options";

export type StageView = "front" | "back" | "left" | "right";

// Sleeves are shown at a three-quarter angle, where their prints face the camera.
const AZIMUTH: Record<StageView, number> = { front: 0, back: Math.PI, left: 0.95, right: -0.95 };

/**
 * One three.js scene showing a garment. Renders only when something changes
 * (dragging, turning, new prints) to save battery on phones.
 */
export class GarmentStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(26, 1, 1, 3000);
  readonly prints = new THREE.Group();
  controls: OrbitControls | null = null;
  garment: GarmentBuild | null = null;
  /** A real 3D garment made from the photos, shown instead of the drawn one when there is one. */
  model: ModelBuild | null = null;
  private wantModel = "";
  private modelColor = "";
  private garmentListeners = new Set<() => void>();
  private garmentKey = "";
  private finishKey = "";
  private ground: THREE.Mesh;
  private frame = 0;
  private tween: { from: number; to: number; start: number } | null = null;
  private target = new THREE.Vector3(0, -30, 0);
  private distance = 220;
  private polar = Math.PI / 2 - 0.06;
  private azimuth = 0;
  private disposed = false;
  /** The studio lights turn with the camera, so whichever side you look at is lit like a product photo. */
  private rig = new THREE.Group();
  private renderListeners = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement, opts: { interactive: boolean; preserveDrawingBuffer?: boolean }) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false });
    r.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    this.renderer = r;

    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.28;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff6ec, 1.75);
    key.position.set(95, 95, 110);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -80;
    key.shadow.camera.right = 80;
    key.shadow.camera.top = 60;
    key.shadow.camera.bottom = -110;
    key.shadow.camera.near = 10;
    key.shadow.camera.far = 400;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.5;
    key.shadow.radius = 4;
    const fill = new THREE.DirectionalLight(0xfff1e0, 0.35);
    fill.position.set(-90, 20, 70);
    const rim = new THREE.DirectionalLight(0xffffff, 0.75);
    rim.position.set(0, 60, -140);
    const back = new THREE.DirectionalLight(0xffffff, 0.45);
    back.position.set(-60, 40, -110);
    this.rig.add(key, fill, rim, back);
    this.scene.add(this.rig, new THREE.HemisphereLight(0xffffff, 0x2a1416, 0.2));

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 46), new THREE.MeshBasicMaterial({ map: groundShadow(), transparent: true, depthWrite: false }));
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground, this.prints);

    if (opts.interactive) {
      const c = new OrbitControls(this.camera, canvas);
      c.enablePan = false;
      c.enableDamping = true;
      c.dampingFactor = 0.09;
      c.rotateSpeed = 0.75;
      c.zoomSpeed = 0.7;
      c.minPolarAngle = 0.95;
      c.maxPolarAngle = 1.85;
      c.addEventListener("start", () => (this.tween = null));
      c.addEventListener("change", () => this.requestRender());
      this.controls = c;
    }
  }

  /**
   * Builds the garment (or, when only the color or fabric changed, just
   * recolors it and swaps the knit texture).
   */
  setGarment(
    mockup: MockupId,
    sleeve: Sleeve,
    fitId: string,
    color: string,
    fabric: { id: string; kind: string } = { id: "cotton", kind: "cotton" },
    trims: GarmentTrims = FULL_TRIMS,
  ) {
    // A real 3D model, when this garment has one (reshaped for looser fits): the drawn garment
    // shows until it has loaded. The models have rib cuffs and waistbands, so without them the
    // drawn garment is used.
    const modelKey = hasFullTrims(trims) && hasModel(mockup, sleeve) ? `${mockup}-${sleeve}${fitKey(fitId)}` : "";
    this.modelColor = color;
    if (modelKey && this.model?.key === modelKey) {
      recolorModel(this.model, color);
      this.requestRender();
      return;
    }
    if (this.model) {
      this.scene.remove(this.model.group);
      disposeGroup(this.model.group);
      this.model = null;
      this.notifyGarment();
    }
    this.wantModel = modelKey;
    if (modelKey) {
      void buildModel(mockup, sleeve, color, fitId)
        .then((build) => {
          if (!build) return;
          if (this.disposed || this.wantModel !== modelKey) {
            disposeGroup(build.group);
            return;
          }
          if (this.garment) {
            this.scene.remove(this.garment.group);
            disposeGroup(this.garment.group);
            this.garment = null;
            this.garmentKey = "";
          }
          recolorModel(build, this.modelColor);
          this.model = build;
          this.scene.add(build.group);
          this.fit();
          this.notifyGarment();
        })
        .catch(() => undefined);
    }
    const key = `${mockup}|${sleeve}|${fitId}${trimsKey(trims)}`;
    const finishKey = `${fabric.id}|${fabric.kind}`;
    if (this.garment && key === this.garmentKey) {
      setFabricColor(this.garment.fabric, color);
      setFabricColor(this.garment.rib, color);
      setThreadColor(this.garment.stitch, color);
      if (finishKey !== this.finishKey) applyFinish(this.garment.fabric, fabricFinish(fabric.id, fabric.kind));
      this.finishKey = finishKey;
      this.requestRender();
      return;
    }
    if (this.garment) {
      this.scene.remove(this.garment.group);
      disposeGroup(this.garment.group);
    }
    this.garment = buildGarment(mockup, sleeve, fitId, color, fabricFinish(fabric.id, fabric.kind), trims);
    this.garmentKey = key;
    this.finishKey = finishKey;
    this.scene.add(this.garment.group);
    this.fit();
    this.notifyGarment();
  }

  /** Calls `fn` when the garment shown changes (e.g. the real 3D model finished loading). Returns a function that stops it. */
  onGarmentChange(fn: () => void): () => void {
    this.garmentListeners.add(fn);
    return () => this.garmentListeners.delete(fn);
  }

  private notifyGarment() {
    for (const fn of this.garmentListeners) fn();
  }

  /** Frames the garment and puts the soft shadow under it. */
  private fit() {
    const shown = this.model?.group ?? this.garment?.group;
    if (!shown) return;
    const box = new THREE.Box3().setFromObject(shown);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.target.copy(center);
    const vFov = (this.camera.fov * Math.PI) / 180;
    const byHeight = (size.y * 0.62) / Math.tan(vFov / 2);
    const byWidth = (size.x * 0.6) / (Math.tan(vFov / 2) * Math.max(this.camera.aspect, 0.4));
    this.distance = Math.max(byHeight, byWidth) + size.z * 0.5;
    this.ground.position.set(center.x, box.min.y - 1.5, center.z);
    if (this.controls) {
      this.controls.target.copy(this.target);
      this.controls.minDistance = this.distance * 0.55;
      this.controls.maxDistance = this.distance * 1.35;
    }
    this.placeCamera();
  }

  private placeCamera() {
    const sp = new THREE.Spherical(this.distance, this.polar, this.azimuth);
    this.camera.position.copy(this.target).add(new THREE.Vector3().setFromSpherical(sp));
    this.camera.lookAt(this.target);
    this.controls?.update();
    this.requestRender();
  }

  /** Turns the garment to show a side. */
  setView(view: StageView, animate = true) {
    const to = AZIMUTH[view];
    if (this.controls) {
      const off = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
      const sp = new THREE.Spherical().setFromVector3(off);
      this.azimuth = sp.theta;
      this.polar = sp.phi;
      this.distance = sp.radius;
    }
    let delta = to - this.azimuth;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (!animate) {
      this.azimuth = to;
      this.placeCamera();
      return;
    }
    this.tween = { from: this.azimuth, to: this.azimuth + delta, start: performance.now() };
    this.requestRender();
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  requestRender = () => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(this.loop);
  };

  private loop = () => {
    this.frame = 0;
    let again = false;
    if (this.tween) {
      const t = Math.min(1, (performance.now() - this.tween.start) / 550);
      const e = 1 - (1 - t) ** 3;
      this.azimuth = this.tween.from + (this.tween.to - this.tween.from) * e;
      const sp = new THREE.Spherical(this.distance, this.polar, this.azimuth);
      this.camera.position.copy(this.target).add(new THREE.Vector3().setFromSpherical(sp));
      this.camera.lookAt(this.target);
      if (t >= 1) this.tween = null;
      again = true;
    }
    if (this.controls && this.controls.update()) again = true;
    this.followCamera();
    this.renderer.render(this.scene, this.camera);
    for (const fn of this.renderListeners) fn();
    if (again) this.requestRender();
  };

  private followCamera() {
    const target = this.controls?.target ?? this.target;
    this.rig.rotation.y = Math.atan2(this.camera.position.x - target.x, this.camera.position.z - target.z);
    this.rig.updateMatrixWorld(true);
  }

  /** Runs after every frame (turning, zooming, new prints). Returns a function that stops it. */
  onRender(fn: () => void): () => void {
    this.renderListeners.add(fn);
    return () => this.renderListeners.delete(fn);
  }

  /** Where a point on the garment shows on the canvas (CSS pixels), and whether its side faces the viewer. */
  project(p: Vec3, n?: Vec3): { x: number; y: number; facing: boolean } {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    const el = this.renderer.domElement;
    let facing = v.z < 1;
    if (n) facing &&= new THREE.Vector3().subVectors(this.camera.position, new THREE.Vector3(p[0], p[1], p[2])).dot(new THREE.Vector3(n[0], n[1], n[2])) > 0;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight, facing };
  }

  /** Renders immediately and returns a PNG (used for pictures in the cart and review). */
  snapshot(): string {
    this.followCamera();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose() {
    this.disposed = true;
    this.renderListeners.clear();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.controls?.dispose();
    if (this.garment) disposeGroup(this.garment.group);
    if (this.model) disposeGroup(this.model.group);
    this.garmentListeners.clear();
    disposeGroup(this.prints);
    this.renderer.dispose();
  }
}
