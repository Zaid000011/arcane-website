import { roundCm } from "./size-charts";
import type { Catalog, PaymentPolicy, PersonalizationPricing, SizeChart, Sleeve, SizeTier } from "./types";

/**
 * The parts of the catalog the owner edits in the price editor. Saved
 * versions store only this, laid over the built-in catalog by id, so
 * products or options added in code later still appear.
 */
export interface PriceSheet {
  products: { id: string; enabled: boolean; basePrice: Partial<Record<Sleeve, number>>; gsm: { gsm: number; priceDelta: number }[]; fabrics: { id: string; priceDelta: number }[] }[];
  fits: { id: string; priceDelta: number }[];
  colors: { id: string; inStock: boolean }[];
  printMethods: { id: string; prices: Partial<Record<SizeTier, number>>; setupFee: number; minQty: number; extraDays: number }[];
  personalization: PersonalizationPricing;
  sizes: { id: string; surcharge: number }[];
  deliverySpeeds: { id: string; percent: number; minFee: number; workingDays: number; enabled: boolean }[];
  shippingZones: { id: string; fee: number }[];
  pickup: { enabled: boolean; fee: number };
  payments: PaymentPolicy;
  /** "MM-DD" every year, or "YYYY-MM-DD" for one date. */
  holidays: string[];
  /** Garment measurements in cm. Versions saved before the size chart existed don't have it. */
  sizeCharts?: SizeChart[];
}

export function priceSheetOf(c: Catalog): PriceSheet {
  return structuredClone({
    products: c.products.map((p) => ({
      id: p.id,
      enabled: p.enabled,
      basePrice: p.basePrice,
      gsm: p.gsmOptions.map((g) => ({ gsm: g.gsm, priceDelta: g.priceDelta })),
      fabrics: p.fabrics.map((f) => ({ id: f.id, priceDelta: f.priceDelta })),
    })),
    fits: c.fits.map((f) => ({ id: f.id, priceDelta: f.priceDelta })),
    colors: c.colors.map((col) => ({ id: col.id, inStock: col.inStock })),
    printMethods: c.printMethods.map((m) => ({ id: m.id, prices: m.prices, setupFee: m.setupFee, minQty: m.minQty, extraDays: m.extraDays })),
    personalization: c.personalization,
    sizes: c.sizes.map((s) => ({ id: s.id, surcharge: s.surcharge })),
    deliverySpeeds: c.deliverySpeeds.map((s) => ({ id: s.id, percent: s.percent, minFee: s.minFee, workingDays: s.workingDays, enabled: s.enabled })),
    shippingZones: c.shippingZones.map((z) => ({ id: z.id, fee: z.fee })),
    pickup: c.pickup,
    payments: c.payments,
    holidays: c.calendar.holidays,
    sizeCharts: c.sizeCharts,
  });
}

/** A copy of the catalog with the sheet's values applied. Ids the catalog doesn't have are ignored, and only existing prices can change. */
export function applyPriceSheet(base: Catalog, sheet: PriceSheet): Catalog {
  const c = structuredClone(base);
  const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);

  for (const sp of sheet.products) {
    const p = byId(c.products, sp.id);
    if (!p) continue;
    p.enabled = sp.enabled;
    for (const sleeve of Object.keys(p.basePrice) as Sleeve[]) {
      const v = sp.basePrice[sleeve];
      if (v !== undefined) p.basePrice[sleeve] = v;
    }
    for (const g of sp.gsm) {
      const opt = p.gsmOptions.find((o) => o.gsm === g.gsm);
      if (opt) opt.priceDelta = g.priceDelta;
    }
    for (const f of sp.fabrics) {
      const fab = byId(p.fabrics, f.id);
      if (fab) fab.priceDelta = f.priceDelta;
    }
  }
  for (const f of sheet.fits) {
    const fit = byId(c.fits, f.id);
    if (fit) fit.priceDelta = f.priceDelta;
  }
  for (const col of sheet.colors) {
    const color = byId(c.colors, col.id);
    if (color) color.inStock = col.inStock;
  }
  for (const sm of sheet.printMethods) {
    const m = byId(c.printMethods, sm.id);
    if (!m) continue;
    for (const tier of Object.keys(m.prices) as SizeTier[]) {
      const v = sm.prices[tier];
      if (v !== undefined) m.prices[tier] = v;
    }
    m.setupFee = sm.setupFee;
    m.minQty = sm.minQty;
    m.extraDays = sm.extraDays;
  }
  c.personalization = structuredClone(sheet.personalization);
  for (const s of sheet.sizes) {
    const size = byId(c.sizes, s.id);
    if (size) size.surcharge = s.surcharge;
  }
  for (const s of sheet.deliverySpeeds) {
    const speed = byId(c.deliverySpeeds, s.id);
    if (!speed) continue;
    speed.percent = s.percent;
    speed.minFee = s.minFee;
    speed.workingDays = s.workingDays;
    speed.enabled = s.enabled;
  }
  for (const z of sheet.shippingZones) {
    const zone = byId(c.shippingZones, z.id);
    if (zone) zone.fee = z.fee;
  }
  c.pickup = { ...sheet.pickup };
  c.payments = { ...sheet.payments };
  c.calendar = { ...c.calendar, holidays: [...new Set(sheet.holidays)].sort() };
  // Only measurements the built-in chart has can change: a garment, fit, size or sleeve it doesn't know is ignored.
  for (const sc of sheet.sizeCharts ?? []) {
    const chart = c.sizeCharts.find((x) => x.productId === sc.productId && x.fitId === sc.fitId);
    if (!chart) continue;
    for (const r of sc.rows) {
      const row = chart.rows.find((x) => x.sizeId === r.sizeId);
      if (!row) continue;
      row.chest = roundCm(r.chest);
      row.length = roundCm(r.length);
      for (const sl of Object.keys(row.sleeve) as Sleeve[]) {
        const v = r.sleeve[sl];
        if (v !== undefined) row.sleeve[sl] = roundCm(v);
      }
    }
  }
  return c;
}

/** Settings that would break the shop, in plain words for the editor. */
export function priceSheetProblems(c: Catalog): string[] {
  const problems: string[] = [];
  if (!c.products.some((p) => p.enabled)) problems.push("Turn on at least one product.");
  if (!c.colors.some((col) => col.inStock)) problems.push("Keep at least one color in stock.");
  if (!c.deliverySpeeds.some((s) => s.enabled)) problems.push("Keep at least one delivery speed on.");
  if (c.personalization.namesList.maxNames < 1) problems.push("The names list needs room for at least one name.");
  return problems;
}
