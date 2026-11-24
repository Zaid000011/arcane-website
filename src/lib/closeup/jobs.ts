import { applyPrint, fabricSurface, shade, type Art, type FabricSide } from "./surface";

/** How much fabric each close-up shows, edge to edge. */
export const FABRIC_VIEW_MM = 12;
export const PRINT_VIEW_MM = 16;

export type CloseUpJob =
  | { type: "fabric"; fabricId: string; kind: string; color: string; size: number; side: FabricSide }
  | { type: "print"; methodId: string; fabricId: string; kind: string; color: string; size: number; art: Art };

/** Builds and lights one close-up. Pure, so it runs in the worker or, as a fallback, on the page. */
export function renderJob(job: CloseUpJob): Uint8ClampedArray {
  if (job.type === "fabric") {
    return shade(fabricSurface({ fabricId: job.fabricId, kind: job.kind, color: job.color, size: job.size, mmPerPx: FABRIC_VIEW_MM / job.size, side: job.side }));
  }
  const s = fabricSurface({ fabricId: job.fabricId, kind: job.kind, color: job.color, size: job.size, mmPerPx: PRINT_VIEW_MM / job.size });
  applyPrint(s, job.art, job.methodId);
  return shade(s);
}
