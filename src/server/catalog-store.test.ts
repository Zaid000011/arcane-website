import { beforeEach, describe, expect, it } from "vitest";
import { applyPriceSheet, priceSheetOf } from "@/lib/catalog/price-sheet";
import { seedCatalog } from "@/lib/catalog/seed";
import { ApiFailure } from "./errors";
import { catalogVersions, getLiveCatalog, restoreVersion, savePriceSheet } from "./catalog-store";
import { useMemoryDb } from "./db";

const NOW = new Date(Date.UTC(2026, 10, 23, 10, 0));

beforeEach(() => {
  useMemoryDb();
});

describe("price sheet", () => {
  it("round-trips the built-in catalog without changes", () => {
    expect(applyPriceSheet(seedCatalog, priceSheetOf(seedCatalog))).toEqual(seedCatalog);
  });

  it("only changes prices that exist", () => {
    const sheet = priceSheetOf(seedCatalog);
    const hoodie = sheet.products.find((p) => p.id === "hoodie")!;
    hoodie.basePrice = { long: 900, short: 1 }; // hoodies have no short sleeve
    sheet.products.push({ id: "ghost", enabled: true, basePrice: { long: 1 }, gsm: [], fabrics: [] });
    const out = applyPriceSheet(seedCatalog, sheet);
    expect(out.products.find((p) => p.id === "hoodie")!.basePrice).toEqual({ long: 900 });
    expect(out.products.some((p) => p.id === "ghost")).toBe(false);
  });

  it("only changes size chart measurements that exist, to the nearest millimetre", () => {
    const sheet = priceSheetOf(seedCatalog);
    const hoodie = sheet.sizeCharts!.find((c) => c.productId === "hoodie" && c.fitId === "regular")!;
    const m = hoodie.rows.find((r) => r.sizeId === "M")!;
    m.chest = 57.26;
    m.length = 70;
    m.sleeve = { long: 64.5, short: 30 }; // hoodies have no short sleeve
    hoodie.rows.push({ sizeId: "5XL", chest: 80, length: 90, sleeve: { long: 70 } });
    sheet.sizeCharts!.push({ productId: "ghost", fitId: "regular", rows: [] });
    const out = applyPriceSheet(seedCatalog, sheet);
    const chart = out.sizeCharts.find((c) => c.productId === "hoodie" && c.fitId === "regular")!;
    expect(chart.rows.find((r) => r.sizeId === "M")).toEqual({ sizeId: "M", chest: 57.3, length: 70, sleeve: { long: 64.5 } });
    expect(chart.rows.map((r) => r.sizeId)).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL"]);
    expect(out.sizeCharts.some((c) => c.productId === "ghost")).toBe(false);
    // The built-in catalog itself is untouched.
    expect(seedCatalog.sizeCharts.find((c) => c.productId === "hoodie" && c.fitId === "regular")!.rows[2]!.chest).toBe(56);
  });

  it("keeps the built-in size chart for versions saved before it existed", () => {
    const { sizeCharts: _old, ...sheet } = priceSheetOf(seedCatalog);
    expect(applyPriceSheet(seedCatalog, sheet).sizeCharts).toEqual(seedCatalog.sizeCharts);
  });
});

describe("saved prices", () => {
  it("uses the built-in prices until something is saved", () => {
    expect(getLiveCatalog()).toBe(seedCatalog);
    expect(catalogVersions()).toEqual([]);
  });

  it("saves a new version that pages and checkout read straight away", () => {
    const sheet = priceSheetOf(seedCatalog);
    sheet.products.find((p) => p.id === "tshirt")!.basePrice.short = 700;
    sheet.payments.depositPercent = 30;
    sheet.holidays = ["2027-03-20", "01-07", "01-07"];
    const v = savePriceSheet(sheet, "Mariam", NOW);
    const live = getLiveCatalog();
    expect(live.version).toBe(v.id);
    expect(live.products.find((p) => p.id === "tshirt")!.basePrice.short).toBe(700);
    expect(live.payments.depositPercent).toBe(30);
    expect(live.calendar.holidays).toEqual(["01-07", "2027-03-20"]);
    expect(catalogVersions()[0]).toMatchObject({ id: v.id, author: "Mariam" });
  });

  it("refuses settings that would break the shop", () => {
    const sheet = priceSheetOf(seedCatalog);
    for (const p of sheet.products) p.enabled = false;
    let err: unknown;
    try {
      savePriceSheet(sheet, "Mariam", NOW);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).details).toEqual(["Turn on at least one product."]);
  });

  it("restores an earlier version or the original prices as a new version", () => {
    const sheet = priceSheetOf(seedCatalog);
    sheet.sizes.find((s) => s.id === "2XL")!.surcharge = 45;
    const first = savePriceSheet(sheet, "Mariam", NOW);
    sheet.sizes.find((s) => s.id === "2XL")!.surcharge = 60;
    savePriceSheet(sheet, "Omar", NOW);
    expect(getLiveCatalog().sizes.find((s) => s.id === "2XL")!.surcharge).toBe(60);

    restoreVersion(first.id, "Mariam", NOW);
    expect(getLiveCatalog().sizes.find((s) => s.id === "2XL")!.surcharge).toBe(45);
    restoreVersion("original", "Mariam", NOW);
    expect(getLiveCatalog().sizes.find((s) => s.id === "2XL")!.surcharge).toBe(0);
    expect(catalogVersions().map((v) => v.note)).toEqual(["Original prices", `Restored version ${first.id}`, "", ""]);
  });

  it("saves size chart changes with the prices, and the original brings the starting chart back", () => {
    const sheet = priceSheetOf(seedCatalog);
    sheet.sizeCharts!.find((c) => c.productId === "tshirt" && c.fitId === "oversized")!.rows[0]!.chest = 54.5;
    savePriceSheet(sheet, "Mariam", NOW);
    const chart = () => getLiveCatalog().sizeCharts.find((c) => c.productId === "tshirt" && c.fitId === "oversized")!;
    expect(chart().rows[0]!.chest).toBe(54.5);
    restoreVersion("original", "Mariam", NOW);
    expect(chart().rows[0]!.chest).toBe(52);
  });
});
