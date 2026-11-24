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
});
