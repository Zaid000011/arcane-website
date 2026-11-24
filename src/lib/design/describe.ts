import { sleeveLabels, tierLabels, tr } from "@/lib/catalog";
import type { Catalog, Locale } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";
import type { Dictionary } from "@/i18n/dictionaries/en";

/** Short human-readable lines describing a design, for the review step and the cart. */
export function describeDesign(catalog: Catalog, d: DesignSelection, locale: Locale, t: Dictionary["designer"]) {
  const product = catalog.products.find((p) => p.id === d.productId);
  const colorName = (id: string) => {
    const c = catalog.colors.find((x) => x.id === id);
    return c ? tr(c.name, locale) : id;
  };
  const fit = catalog.fits.find((f) => f.id === d.fitId);
  const fabric = product?.fabrics.find((f) => f.id === d.fabricId);

  const garment = [
    product ? tr(product.name, locale) : d.productId,
    tr(sleeveLabels[d.sleeve], locale),
    fit ? tr(fit.name, locale) : null,
    `${d.gsm} GSM`,
    fabric ? tr(fabric.name, locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const colors = [
    colorName(d.bodyColorId),
    ...Object.entries(d.partColors).map(([partId, colorId]) => {
      const part = catalog.colorParts.find((p) => p.id === partId);
      return `${part ? tr(part.name, locale) : partId}: ${colorName(colorId)}`;
    }),
  ];

  const prints = d.prints.map((p) => {
    const area = catalog.printAreas.find((a) => a.id === p.areaId);
    const method = catalog.printMethods.find((m) => m.id === p.methodId);
    return [area ? tr(area.name, locale) : p.areaId, method ? tr(method.name, locale) : p.methodId, tr(tierLabels[p.tier], locale)].join(" · ");
  });

  const pz = d.personalization;
  const personalization = [
    pz.names ? t.nameOption : null,
    pz.numbers ? t.numberOption : null,
    pz.namesList ? `${t.namesListOption} (${pz.namesListNames?.length ?? 0})` : null,
    pz.neckLabel ? `${t.neckLabelOption}${pz.neckLabelText ? `: ${pz.neckLabelText}` : ""}` : null,
  ].filter((x): x is string => Boolean(x));

  return { garment, colors, prints, personalization };
}

/** "M × 10 · L × 15" in catalog size order. */
export function describeSizes(catalog: Catalog, sizes: Record<string, number>): string {
  return catalog.sizes
    .filter((s) => (sizes[s.id] ?? 0) > 0)
    .map((s) => `${s.label} × ${sizes[s.id]}`)
    .join(" · ");
}
