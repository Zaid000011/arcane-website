import { TIER_ORDER, tierAtMost } from "@/lib/catalog";
import type { Catalog, PrintArea, SizeTier, Sleeve } from "@/lib/catalog/types";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { printBoxMm, rescaleElements } from "./geometry";
import { normalizePersonalization } from "./personalization";
import type { DesignElement } from "./types";

/** Pure helpers that keep a design valid as the customer changes options. */

export function maxTierFor(area: PrintArea, sleeve: Sleeve): SizeTier {
  return sleeve === "short" && area.maxTierShortSleeve ? area.maxTierShortSleeve : area.maxTier;
}

/** Size tiers that fit the area and are offered by the method. */
export function allowedTiers(catalog: Catalog, sleeve: Sleeve, areaId: string, methodId: string): SizeTier[] {
  const area = catalog.printAreas.find((a) => a.id === areaId);
  const method = catalog.printMethods.find((m) => m.id === methodId);
  if (!area || !method) return [];
  const max = maxTierFor(area, sleeve);
  return TIER_ORDER.filter((t) => tierAtMost(t, max) && method.prices[t] !== undefined);
}

/** Why a method can't be used with the current fabric/color, or null if it can. */
export function methodBlock(catalog: Catalog, design: DesignSelection, methodId: string): "fabric" | "lightColor" | null {
  const method = catalog.printMethods.find((m) => m.id === methodId);
  const product = catalog.products.find((p) => p.id === design.productId);
  if (!method || !product) return null;
  const fabric = product.fabrics.find((f) => f.id === design.fabricId);
  const color = catalog.colors.find((c) => c.id === design.bodyColorId);
  if (method.fabricKinds && fabric && !method.fabricKinds.includes(fabric.kind)) return "fabric";
  if (method.lightGarmentsOnly && color && !color.light) return "lightColor";
  return null;
}

export function defaultDesign(catalog: Catalog, productId?: string): DesignSelection {
  const product =
    catalog.products.find((p) => p.id === productId && p.enabled) ?? catalog.products.find((p) => p.enabled) ?? catalog.products[0]!;
  const body = catalog.colors.find((c) => c.id === "black" && c.inStock) ?? catalog.colors.find((c) => c.inStock) ?? catalog.colors[0]!;
  return {
    productId: product.id,
    sleeve: product.defaultSleeve,
    fitId: product.fitIds[0] ?? "regular",
    gsm: product.defaultGsm,
    fabricId: product.defaultFabricId,
    bodyColorId: body.id,
    partColors: {},
    prints: [],
    personalization: { names: false, numbers: false, namesList: false, neckLabel: false },
  };
}

/**
 * Fixes the size tier and color count for the area/method, and rescales the
 * artwork if the print box changed size (from `fromTier`).
 */
function clampPrint(catalog: Catalog, sleeve: Sleeve, print: PrintSelection, fromTier: SizeTier = print.tier): PrintSelection {
  const tiers = allowedTiers(catalog, sleeve, print.areaId, print.methodId);
  const tier = tiers.includes(print.tier) ? print.tier : (tiers[tiers.length - 1] ?? print.tier);
  const method = catalog.printMethods.find((m) => m.id === print.methodId);
  const max = method?.maxColors ?? 1;
  const colorCount = method?.pricedPerColor ? Math.min(Math.max(1, Math.floor(print.colorCount ?? 1)), max) : undefined;
  let elements = sanitizeElements(print.elements);
  const area = catalog.printAreas.find((a) => a.id === print.areaId);
  if (area && elements.length > 0 && fromTier !== tier) {
    elements = rescaleElements(elements, printBoxMm(area, fromTier), printBoxMm(area, tier));
  }
  return { areaId: print.areaId, methodId: print.methodId, tier, ...(colorCount ? { colorCount } : {}), elements };
}

/** Drops anything in saved data that isn't a well-formed element. */
function sanitizeElements(elements: unknown): DesignElement[] {
  if (!Array.isArray(elements)) return [];
  return elements.filter((e): e is DesignElement => {
    if (!e || typeof e !== "object") return false;
    const el = e as Partial<DesignElement>;
    const numbersOk = [el.x, el.y, el.rotation].every((n) => typeof n === "number" && Number.isFinite(n));
    if (!numbersOk || typeof el.id !== "string") return false;
    if (el.type === "text") return typeof el.text === "string" && typeof el.size === "number" && el.size > 0;
    if (el.type === "image") return typeof el.assetId === "string" && typeof el.w === "number" && el.w > 0 && typeof el.aspect === "number";
    if (el.type === "clipart") return typeof el.clipartId === "string" && typeof el.w === "number" && el.w > 0;
    return false;
  });
}

/** Repairs anything that doesn't fit the current product (after switching products or loading a saved design). */
export function normalizeDesign(catalog: Catalog, d: Partial<DesignSelection>): DesignSelection {
  const base = defaultDesign(catalog, d.productId);
  const product = catalog.products.find((p) => p.id === base.productId)!;
  const sleeve = d.sleeve && product.basePrice[d.sleeve] !== undefined ? d.sleeve : product.defaultSleeve;
  const fitId = d.fitId && product.fitIds.includes(d.fitId) ? d.fitId : base.fitId;
  const gsm = product.gsmOptions.some((g) => g.gsm === d.gsm) ? d.gsm! : product.defaultGsm;
  const fabricId = product.fabrics.some((f) => f.id === d.fabricId) ? d.fabricId! : product.defaultFabricId;
  const colorOk = (id: string | undefined) => catalog.colors.some((c) => c.id === id && c.inStock);
  const bodyColorId = colorOk(d.bodyColorId) ? d.bodyColorId! : base.bodyColorId;
  // Separate part colors (hood lining, strings, cuffs…) are no longer offered: everything matches the body.
  const partColors: Record<string, string> = {};
  const seen = new Set<string>();
  const prints = (d.prints ?? [])
    .filter((p) => {
      if (!product.printAreaIds.includes(p.areaId) || seen.has(p.areaId)) return false;
      if (!catalog.printMethods.some((m) => m.id === p.methodId)) return false;
      seen.add(p.areaId);
      return true;
    })
    .map((p) => clampPrint(catalog, sleeve, p));
  return {
    ...base,
    sleeve,
    fitId,
    gsm,
    fabricId,
    bodyColorId,
    partColors,
    prints,
    personalization: normalizePersonalization(product, { ...base.personalization, ...d.personalization }),
  };
}

/**
 * Switches product but keeps choices that still apply (colors, prints on shared areas).
 * Sleeve starts at the new product's default, since the old choice may not have been deliberate.
 */
export function switchProduct(catalog: Catalog, d: DesignSelection, productId: string): DesignSelection {
  const product = catalog.products.find((p) => p.id === productId);
  if (!product) return d;
  const keepFabric = product.fabrics.find((f) => f.id === d.fabricId)?.id;
  return normalizeDesign(catalog, {
    ...d,
    productId,
    sleeve: product.defaultSleeve,
    gsm: product.gsmOptions.some((g) => g.gsm === d.gsm) ? d.gsm : product.defaultGsm,
    fabricId: keepFabric ?? product.defaultFabricId,
  });
}

/** Turns a print area on (with a sensible default method and size) or off. */
export function togglePrint(catalog: Catalog, d: DesignSelection, areaId: string): DesignSelection {
  if (d.prints.some((p) => p.areaId === areaId)) {
    return { ...d, prints: d.prints.filter((p) => p.areaId !== areaId) };
  }
  const method =
    catalog.printMethods.find((m) => !methodBlock(catalog, d, m.id) && allowedTiers(catalog, d.sleeve, areaId, m.id).length > 0) ??
    catalog.printMethods[0]!;
  const tiers = allowedTiers(catalog, d.sleeve, areaId, method.id);
  const tier: SizeTier = tiers.includes("M") ? "M" : (tiers[tiers.length - 1] ?? "S");
  const print: PrintSelection = { areaId, methodId: method.id, tier, ...(method.pricedPerColor ? { colorCount: 1 } : {}), elements: [] };
  return { ...d, prints: [...d.prints, print] };
}

export function updatePrint(catalog: Catalog, d: DesignSelection, areaId: string, patch: Partial<PrintSelection>): DesignSelection {
  return {
    ...d,
    prints: d.prints.map((p) => (p.areaId === areaId ? clampPrint(catalog, d.sleeve, { ...p, ...patch, areaId }, p.tier) : p)),
  };
}
