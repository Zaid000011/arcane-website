"use client";

import type { Catalog } from "@/lib/catalog/types";
import { defaultDesign } from "@/lib/design/logic";
import { GarmentImage } from "./GarmentImage";

/** Plain 3D picture of a product in one color, for product cards. */
export function ProductThumb({ catalog, productId, colorId, alt, className }: { catalog: Catalog; productId: string; colorId: string; alt: string; className?: string }) {
  return <GarmentImage catalog={catalog} design={{ ...defaultDesign(catalog, productId), bodyColorId: colorId }} width={420} height={420} alt={alt} className={className} />;
}
