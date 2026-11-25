"use client";

import { useEffect, useState } from "react";
import { isLightHex } from "@/components/garment/color";
import type { FabricKind, PrintMethod } from "@/lib/catalog/types";
import { PRINT_VIEW_MM, renderJob, type CloseUpJob } from "./jobs";
import { srgbToLinear, type Art } from "./surface";

/* ---------- drawing in a background worker ---------- */

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { job: CloseUpJob; resolve: (px: Uint8ClampedArray) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; px: Uint8ClampedArray | null }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      p.resolve(e.data.px ?? renderJob(p.job));
    };
    worker.onerror = () => {
      // The worker couldn't run: draw whatever is waiting on the page instead.
      worker?.terminate();
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        p.resolve(renderJob(p.job));
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

const cache = new Map<string, Promise<ImageData>>();

/** Draws a close-up (or returns the one drawn before with the same key). */
export function closeUp(key: string, job: CloseUpJob): Promise<ImageData> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const promise = new Promise<Uint8ClampedArray>((resolve) => {
    const w = getWorker();
    if (!w) {
      setTimeout(() => resolve(renderJob(job)), 0);
      return;
    }
    const id = nextId++;
    pending.set(id, { job, resolve });
    w.postMessage({ id, job });
  }).then((px) => new ImageData(px as Uint8ClampedArray<ArrayBuffer>, job.size, job.size));
  cache.set(key, promise);
  if (cache.size > 48) cache.delete(cache.keys().next().value!);
  return promise;
}

/**
 * The close-up for `key`, drawn by `make` (which may need to load the artwork
 * first). Keeps showing the previous picture until the new one is ready.
 */
export function useCloseUp(key: string | null, make: () => Promise<{ key: string; job: CloseUpJob } | null>): ImageData | null {
  const [image, setImage] = useState<ImageData | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const timer = setTimeout(() => {
      void make()
        .then((r) => (r ? closeUp(r.key, r.job) : null))
        .then((img) => {
          if (live && img) setImage(img);
        })
        .catch(() => undefined);
    }, 60);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `make` changes every render; the key says when the picture really changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return key ? image : null;
}

/* ---------- artwork for print close-ups ---------- */

/** Coverage and color of a square canvas, as the renderer wants them. */
export function artFrom(canvas: HTMLCanvasElement, size: number): Art {
  let source = canvas;
  if (canvas.width !== size || canvas.height !== size) {
    source = document.createElement("canvas");
    source.width = source.height = size;
    source.getContext("2d")!.drawImage(canvas, 0, 0, size, size);
  }
  const data = source.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, size, size).data;
  const n = size * size;
  const art: Art = { a: new Float32Array(n), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
  const lut = new Float32Array(256).map((_, v) => srgbToLinear(v / 255));
  for (let i = 0; i < n; i++) {
    art.a[i] = data[i * 4 + 3]! / 255;
    art.r[i] = lut[data[i * 4]!]!;
    art.g[i] = lut[data[i * 4 + 1]!]!;
    art.b[i] = lut[data[i * 4 + 2]!]!;
  }
  return art;
}

const FULL_COLOR = ["dtf", "dtg", "sublimation"];

/**
 * The example design for print close-ups: the brand star, a fine ring and a
 * bar, so each method shows its edges, its surface and how fine it can go.
 * Full-color methods get a gradient; patches get their fabric base and rim.
 */
export function sampleArt(methodId: string, garmentHex: string, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const light = isLightHex(garmentHex);
  const main = light ? "#7A0A0A" : "#F5EBD8";
  const full = FULL_COLOR.includes(methodId);
  const patch = methodId === "wovenPatch" ? "woven" : methodId === "chenillePatch" ? "chenille" : null;
  const k = size / PRINT_VIEW_MM;
  ctx.translate(size / 2, size / 2);
  ctx.scale(k, k);

  const gradient = () => {
    const g = ctx.createLinearGradient(-6, -6, 6, 6);
    g.addColorStop(0, "#E2C766");
    g.addColorStop(0.5, "#E36414");
    g.addColorStop(1, "#9B1414");
    return g;
  };
  const star = (r: number) => {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.quadraticCurveTo(0, 0, 0, r);
    ctx.quadraticCurveTo(0, 0, -r, 0);
    ctx.quadraticCurveTo(0, 0, 0, -r);
    ctx.closePath();
  };

  if (patch) {
    // The patch's corner, with its stitched rim and the garment showing around it.
    ctx.beginPath();
    ctx.roundRect(-6.2, -5.8, 30, 30, 3);
    ctx.fillStyle = patch === "woven" ? "#F1E9D8" : "#EFE4CC";
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = patch === "woven" ? "#7A0A0A" : "#C9A227";
    ctx.stroke();
    ctx.translate(1.4, 1.6);
    star(4.4);
    ctx.fillStyle = "#7A0A0A";
    ctx.fill();
    return canvas;
  }

  ctx.translate(-2.5, -1);
  star(5.5);
  ctx.fillStyle = full ? gradient() : "#C9A227";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = main;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(5, 3.2, 30, 3.6, 0.6);
  ctx.fillStyle = main;
  ctx.fill();
  return canvas;
}

/**
 * The customer's whole artwork, centred in a square, for the close-up: what
 * they wrote stays readable, drawn in the print type's finish on the fabric.
 * Returns how many mm of fabric the square shows (enough for the circle to
 * take in the artwork's full diagonal).
 */
export function fitArt(art: HTMLCanvasElement, wMm: number, hMm: number, size: number): { canvas: HTMLCanvasElement; viewMm: number } {
  const viewMm = Math.min(450, Math.max(PRINT_VIEW_MM, Math.hypot(wMm, hMm) * 1.06));
  const k = size / viewMm;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(art, (size - wMm * k) / 2, (size - hMm * k) / 2, wMm * k, hMm * k);
  return { canvas, viewMm };
}

/** Pixel size for a close-up shown `cssPx` wide: sharp on phones, but not so big it's slow to draw. */
export function closeUpSize(cssPx: number, max = 320): number {
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  return Math.max(96, Math.min(max, Math.round((cssPx * dpr) / 16) * 16));
}

const FABRIC_FOR_KIND: Record<FabricKind, string> = { cotton: "cotton", blend: "cottonPoly", polyester: "polyester", wool: "melton" };

/**
 * A fabric and color the method really works on, for showing it up close:
 * DTG on cotton, sublimation on light polyester. Otherwise the garment's own.
 */
export function closeUpFabric(method: PrintMethod, fabric: { id: string; kind: FabricKind }, color: string): { fabricId: string; kind: FabricKind; color: string } {
  let fabricId = fabric.id;
  let kind = fabric.kind;
  if (method.fabricKinds?.length && !method.fabricKinds.includes(kind)) {
    kind = method.fabricKinds[0]!;
    fabricId = FABRIC_FOR_KIND[kind];
  }
  return { fabricId, kind, color: method.lightGarmentsOnly && !isLightHex(color) ? "#F7F7F5" : color };
}
