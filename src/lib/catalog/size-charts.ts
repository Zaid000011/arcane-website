import type { Catalog, FitOption, Product, Size, SizeChart, SizeMeasurements, Sleeve } from "./types";

/**
 * The size chart: each garment's measurements, size by size, in cm with the
 * garment laid flat. These are typical measurements to start from; the owner
 * replaces them with the real garments' numbers in Admin → Prices.
 */

/** Sizes the starting measurements are written for, smallest first. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

interface Measures {
  chest: number[];
  length: number[];
  sleeve: Partial<Record<Sleeve, number[]>>;
}

/** Regular fit, XS to 3XL. */
const REGULAR: Record<string, Measures> = {
  hoodie: { chest: [50, 53, 56, 59, 62, 65, 68], length: [63, 66, 69, 71, 73, 75, 77], sleeve: { long: [59, 61, 63, 64, 65, 66, 67] } },
  zipHoodie: { chest: [50, 53, 56, 59, 62, 65, 68], length: [63, 66, 69, 71, 73, 75, 77], sleeve: { long: [59, 61, 63, 64, 65, 66, 67] } },
  tshirt: {
    chest: [46, 49, 52, 55, 58, 61, 64],
    length: [66, 69, 71, 73, 75, 77, 79],
    sleeve: { short: [18, 19, 20, 21, 22, 23, 24], long: [58, 60, 62, 63, 64, 65, 66] },
  },
  sweatshirt: { chest: [49, 52, 55, 58, 61, 64, 67], length: [62, 65, 67, 69, 71, 73, 75], sleeve: { long: [58, 60, 62, 63, 64, 65, 66] } },
  polo: {
    chest: [47, 50, 53, 56, 59, 62, 65],
    length: [66, 69, 71, 73, 75, 77, 79],
    sleeve: { short: [18, 19, 20, 21, 22, 23, 23], long: [58, 60, 62, 63, 64, 65, 66] },
  },
  varsity: { chest: [52, 55, 58, 61, 64, 67, 70], length: [60, 63, 65, 67, 69, 71, 73], sleeve: { long: [59, 61, 63, 64, 65, 66, 67] } },
};

/**
 * How each fit changes the regular measurements. Oversized is wider and longer
 * with dropped shoulders, so a long sleeve measures shorter from its seam;
 * boxy is wide and cropped.
 */
const FIT_CHANGE: Record<string, { chest: number; length: number; sleeve: Record<Sleeve, number> }> = {
  regular: { chest: 0, length: 0, sleeve: { short: 0, long: 0 } },
  oversized: { chest: 6, length: 3, sleeve: { short: 3, long: -2 } },
  boxy: { chest: 5, length: -5, sleeve: { short: 1, long: -1 } },
};

/** The sleeve lengths a garment comes in. */
export function sleevesOf(product: Product): Sleeve[] {
  return (["short", "long"] as const).filter((s) => product.basePrice[s] !== undefined);
}

/** Starting size charts for every garment in every fit it comes in. */
export function startingSizeCharts(products: Product[], fits: FitOption[], sizes: Size[]): SizeChart[] {
  const charts: SizeChart[] = [];
  for (const product of products) {
    const base = REGULAR[product.id];
    if (!base) continue;
    for (const fitId of product.fitIds) {
      if (!fits.some((f) => f.id === fitId)) continue;
      const change = FIT_CHANGE[fitId] ?? FIT_CHANGE.regular!;
      const rows: SizeMeasurements[] = [];
      for (const size of sizes) {
        const i = SIZE_ORDER.indexOf(size.id);
        if (i < 0) continue;
        const sleeve: Partial<Record<Sleeve, number>> = {};
        for (const s of sleevesOf(product)) {
          const v = base.sleeve[s]?.[i];
          if (v !== undefined) sleeve[s] = v + change.sleeve[s];
        }
        rows.push({ sizeId: size.id, chest: base.chest[i]! + change.chest, length: base.length[i]! + change.length, sleeve });
      }
      charts.push({ productId: product.id, fitId, rows });
    }
  }
  return charts;
}

/** The size chart for a garment in a fit (the regular fit's when that fit has none). */
export function sizeChartFor(catalog: Catalog, productId: string, fitId: string): SizeChart | undefined {
  return (
    catalog.sizeCharts.find((c) => c.productId === productId && c.fitId === fitId) ??
    catalog.sizeCharts.find((c) => c.productId === productId && c.fitId === "regular") ??
    catalog.sizeCharts.find((c) => c.productId === productId)
  );
}

/** A measurement rounded to the nearest millimetre. */
export function roundCm(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Centimetres to inches, to the nearest quarter inch. */
export function cmToInches(cm: number): number {
  return Math.round((cm / 2.54) * 4) / 4;
}
