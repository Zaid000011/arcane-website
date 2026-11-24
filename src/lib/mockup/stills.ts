import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import { composeGarmentPhoto } from "./compose";
import type { PhotoView } from "./photos";

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
