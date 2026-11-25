import { STATIC_ROOT } from "@/lib/site-mode";

/** Print types with a real close-up photo (public/print-types). Types added later fall back to a drawn close-up. */
const PHOTOS = new Set(["dtf", "dtg", "screen", "puff", "embroidery", "embroidery3d", "sublimation", "vinyl", "vinylSpecial", "wovenPatch", "chenillePatch"]);

/** The real close-up photo of a print type, or null when there isn't one. */
export function printPhotoUrl(methodId: string): string | null {
  return PHOTOS.has(methodId) ? `${STATIC_ROOT}/print-types/${methodId}.webp` : null;
}
