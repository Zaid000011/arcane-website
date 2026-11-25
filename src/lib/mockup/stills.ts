import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import { composeGarmentPhoto, type PhotoLayout } from "./compose";
import type { GarmentPhoto, PhotoView } from "./photos";

/** The garment photo in its color with nothing printed on it (behind the print editor). */
export interface PlainPhoto {
  url: string;
  width: number;
  height: number;
  /** Canvas pixel = photo pixel × scale + (dx, dy). */
  layout: PhotoLayout;
  photo: GarmentPhoto;
}

const plainCache = new Map<string, Promise<PlainPhoto | null>>();

export function plainGarmentPhoto(catalog: Catalog, design: DesignSelection, view: PhotoView): Promise<PlainPhoto | null> {
  const key = [design.productId, design.sleeve, design.bodyColorId, view].join("|");
  const hit = plainCache.get(key);
  if (hit) return hit;
  const plain: DesignSelection = { ...design, prints: [], personalization: { names: false, numbers: false, namesList: false, neckLabel: false } };
  const job = queue.then(async () => {
    const size = 1400;
    const result = await composeGarmentPhoto({ catalog, design: plain, view, width: size, height: size, pad: { top: 0.02, bottom: 0.02, side: 0.02 } });
    if (!result) return null;
    const canvas = document.createElement("canvas");
    canvas.width = result.image.width;
    canvas.height = result.image.height;
    canvas.getContext("2d")!.putImageData(result.image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");
    return { url, width: result.image.width, height: result.image.height, layout: result.layout, photo: result.photo };
  });
  queue = job.catch(() => undefined);
  job.catch(() => plainCache.delete(key));
  plainCache.set(key, job);
  return job;
}

/**
 * Still photos of designs (cart, review, orders, product cards), drawn one at
 * a time and kept as small WebP files in memory.
 */

const PAD = { top: 0.04, bottom: 0.04, side: 0.05 };
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<string | null>>();

/** An image URL of the design on its garment photo, or null when there's no photo for it. */
export function renderPhotoImage(catalog: Catalog, design: DesignSelection, view: PhotoView, width: number, height: number, samples?: PrintSamples): Promise<string | null> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const key = JSON.stringify([design, view, width, height, dpr, samples ?? null]);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    const result = await composeGarmentPhoto({ catalog, design, view, width: Math.round(width * dpr), height: Math.round(height * dpr), samples, pad: PAD });
    if (!result) return null;
    const canvas = document.createElement("canvas");
    canvas.width = result.image.width;
    canvas.height = result.image.height;
    canvas.getContext("2d")!.putImageData(result.image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    return blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/png");
  });
  queue = job.catch(() => undefined);
  job.catch(() => cache.delete(key));
  cache.set(key, job);
  if (cache.size > 80) {
    const [oldKey, old] = cache.entries().next().value!;
    cache.delete(oldKey);
    void old.then((url) => url?.startsWith("blob:") && URL.revokeObjectURL(url)).catch(() => undefined);
  }
  return job;
}
