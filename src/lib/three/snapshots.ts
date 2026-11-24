import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";
import { updatePrintLayers, type PrintSamples } from "./print-layers";
import { GarmentStage, type StageView } from "./stage";

/**
 * Still pictures of designs (cart, review, home page). One hidden renderer
 * draws them one at a time, so a page full of pictures uses a single WebGL
 * context.
 */

let stage: GarmentStage | null = null;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, string>();

function getStage(): GarmentStage {
  if (!stage) {
    const canvas = document.createElement("canvas");
    stage = new GarmentStage(canvas, { interactive: false, preserveDrawingBuffer: true });
  }
  return stage;
}

export function renderGarmentImage(
  catalog: Catalog,
  design: DesignSelection,
  view: StageView,
  width: number,
  height: number,
  samples?: PrintSamples,
): Promise<string> {
  const key = JSON.stringify([design, view, width, height, samples ?? null]);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = cache.get(key);
    if (again) return again;
    const s = getStage();
    const product = catalog.products.find((p) => p.id === design.productId) ?? catalog.products[0]!;
    const color = catalog.colors.find((c) => c.id === design.bodyColorId)?.hex ?? "#151515";
    const fabric = product.fabrics.find((f) => f.id === design.fabricId) ?? product.fabrics[0];
    s.setGarment(product.mockup, design.sleeve, design.fitId, color, { id: fabric?.id ?? "cotton", kind: fabric?.kind ?? "cotton" });
    s.resize(width, height);
    s.setView(view, false);
    await updatePrintLayers(s, catalog, design, { samples });
    const url = s.snapshot();
    if (cache.size > 120) cache.clear();
    cache.set(key, url);
    return url;
  });
  queue = job.catch(() => undefined);
  return job;
}
