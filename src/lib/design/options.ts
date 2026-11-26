import type { Catalog, Product, Sleeve } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";

/**
 * Garment options that change how the garment itself looks: the customer's
 * own body color, and taking off the rib cuffs or rib waistband.
 */

/** "#RRGGBB". */
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** The body color to draw: the customer's own color when they picked one, otherwise the stocked color's. */
export function bodyHex(catalog: Catalog, design: Pick<DesignSelection, "bodyColorId" | "customColorHex">): string {
  if (design.customColorHex && HEX_COLOR.test(design.customColorHex)) return design.customColorHex.toUpperCase();
  return catalog.colors.find((c) => c.id === design.bodyColorId)?.hex ?? "#151515";
}

/** Which rib trims the garment really has. */
export interface GarmentTrims {
  cuffs: boolean;
  waistband: boolean;
}

export const FULL_TRIMS: GarmentTrims = { cuffs: true, waistband: true };

/** Rib cuffs can come off garments that have them, on long sleeves. */
export function canRemoveCuffs(product: Product | undefined, sleeve: Sleeve): boolean {
  return Boolean(product?.ribCuffs) && sleeve === "long";
}

export function canRemoveWaistband(product: Product | undefined): boolean {
  return Boolean(product?.ribWaistband);
}

/** The trims this design ends up with: rib cuffs and waistband unless the customer took them off (where that's possible). */
export function trimsOf(product: Product | undefined, design: Pick<DesignSelection, "sleeve" | "noCuffs" | "noWaistband">): GarmentTrims {
  return {
    cuffs: !(design.noCuffs && canRemoveCuffs(product, design.sleeve)),
    waistband: !(design.noWaistband && canRemoveWaistband(product)),
  };
}

/** Name part for a garment photo or model without some trims: "", "-nocuffs", "-noband" or "-nocuffs-noband". */
export function trimsKey(trims: GarmentTrims = FULL_TRIMS): string {
  return `${trims.cuffs ? "" : "-nocuffs"}${trims.waistband ? "" : "-noband"}`;
}

export function hasFullTrims(trims: GarmentTrims): boolean {
  return trims.cuffs && trims.waistband;
}

/** Name part for a garment photo in a looser fit: "", "-oversized" or "-boxy". */
export function fitKey(fitId: string): string {
  return fitId === "oversized" || fitId === "boxy" ? `-${fitId}` : "";
}
