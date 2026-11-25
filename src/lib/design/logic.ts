import type { Catalog, MockupId, Sleeve } from "@/lib/catalog/types";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { normalizePersonalization } from "./personalization";
import { constrainToPanel, fitToMethod, isPrintSide, MAX_PRINTS_PER_SIDE, migrateLegacyPrint, newPrintId, panelBox, printTier, sidesFor, type LegacyPrint, type PrintSide } from "./sides";
import type { DesignElement } from "./types";

/** Pure helpers that keep a design valid as the customer changes options. */

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
 * Keeps a print valid: the color count within the method's limit, the artwork
 * on its panel and no bigger than the method allows, and the size tier
 * worked out from the artwork.
 */
function clampPrint(catalog: Catalog, mockup: MockupId, sleeve: Sleeve, print: PrintSelection): PrintSelection {
  const method = catalog.printMethods.find((m) => m.id === print.methodId);
  const max = method?.maxColors ?? 1;
  const colorCount = method?.pricedPerColor ? Math.min(Math.max(1, Math.floor(print.colorCount ?? 1)), max) : undefined;
  let elements = sanitizeElements(print.elements);
  if (isPrintSide(print.areaId)) elements = constrainToPanel(elements, panelBox(mockup, sleeve, print.areaId));
  if (method) elements = fitToMethod(elements, method);
  return { id: print.id, areaId: print.areaId, methodId: print.methodId, tier: printTier({ elements }), ...(colorCount ? { colorCount } : {}), elements };
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

/**
 * Prints as saved: current ones carry an id; ones saved before prints could go
 * anywhere were tied to a fixed area (left chest, full back…) and become free
 * prints on that side, with the artwork where it was.
 */
function readPrints(catalog: Catalog, mockup: MockupId, sleeve: Sleeve, raw: unknown): PrintSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: PrintSelection[] = [];
  const ids = new Set<string>();
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== "object") continue;
    const p = item as Partial<PrintSelection>;
    if (typeof p.areaId !== "string" || typeof p.methodId !== "string") continue;
    let print: PrintSelection | null;
    if (typeof p.id === "string" && p.id && isPrintSide(p.areaId)) {
      print = { id: p.id, areaId: p.areaId, methodId: p.methodId, tier: p.tier ?? "S", colorCount: p.colorCount, elements: p.elements };
    } else {
      print = migrateLegacyPrint(catalog, mockup, sleeve, { ...(p as LegacyPrint), tier: p.tier ?? "M" }, `p-${p.areaId}-${index}`);
    }
    if (!print) continue;
    if (ids.has(print.id)) print = { ...print, id: newPrintId() };
    ids.add(print.id);
    out.push(print);
  }
  return out;
}

/**
 * The design with any prints saved the old way (tied to a fixed area) turned
 * into free prints, and nothing else changed. For showing placed orders
 * exactly as they were ordered.
 */
export function withFreePrints(catalog: Catalog, d: DesignSelection): DesignSelection {
  if (d.prints.every((p) => p.id && isPrintSide(p.areaId))) return d;
  const product = catalog.products.find((p) => p.id === d.productId);
  return product ? { ...d, prints: readPrints(catalog, product.mockup, d.sleeve, d.prints) } : d;
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
  const sides = sidesFor(product.mockup);
  const perSide = new Map<string, number>();
  const prints = readPrints(catalog, product.mockup, sleeve, d.prints)
    .filter((p) => {
      if (!sides.includes(p.areaId as PrintSide)) return false;
      if (!catalog.printMethods.some((m) => m.id === p.methodId)) return false;
      const count = (perSide.get(p.areaId) ?? 0) + 1;
      perSide.set(p.areaId, count);
      return count <= MAX_PRINTS_PER_SIDE;
    })
    .map((p) => clampPrint(catalog, product.mockup, sleeve, p));
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
 * Switches product but keeps choices that still apply (colors, prints on sides it also has).
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

/** The method a new print starts with: the first that works on this fabric and color. */
function defaultMethod(catalog: Catalog, d: DesignSelection) {
  return catalog.printMethods.find((m) => !methodBlock(catalog, d, m.id)) ?? catalog.printMethods[0]!;
}

/** Adds an empty print on a side. Returns the new print's id (null when the side is full or not on this garment). */
export function addPrint(catalog: Catalog, d: DesignSelection, side: PrintSide): { design: DesignSelection; printId: string | null } {
  const product = catalog.products.find((p) => p.id === d.productId);
  if (!product || !sidesFor(product.mockup).includes(side)) return { design: d, printId: null };
  if (d.prints.filter((p) => p.areaId === side).length >= MAX_PRINTS_PER_SIDE) return { design: d, printId: null };
  const method = defaultMethod(catalog, d);
  const print: PrintSelection = { id: newPrintId(), areaId: side, methodId: method.id, tier: "S", ...(method.pricedPerColor ? { colorCount: 1 } : {}), elements: [] };
  return { design: { ...d, prints: [...d.prints, print] }, printId: print.id };
}

export function removePrint(d: DesignSelection, printId: string): DesignSelection {
  return { ...d, prints: d.prints.filter((p) => p.id !== printId) };
}

/** Changes a print's method or ink colors. Artwork too big for a new method shrinks to fit it. */
export function updatePrint(catalog: Catalog, d: DesignSelection, printId: string, patch: Partial<Pick<PrintSelection, "methodId" | "colorCount">>): DesignSelection {
  const product = catalog.products.find((p) => p.id === d.productId);
  if (!product) return d;
  return {
    ...d,
    prints: d.prints.map((p) => (p.id === printId ? clampPrint(catalog, product.mockup, d.sleeve, { ...p, ...patch }) : p)),
  };
}
