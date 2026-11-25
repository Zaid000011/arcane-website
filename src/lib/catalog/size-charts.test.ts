import { describe, expect, it } from "vitest";
import { priceSheetSchema } from "@/lib/validation";
import { priceSheetOf } from "./price-sheet";
import { seedCatalog } from "./seed";
import { cmToInches, sizeChartFor, sleevesOf } from "./size-charts";

describe("starting size charts", () => {
  it("cover every garment in every fit it comes in, for every size", () => {
    for (const product of seedCatalog.products) {
      for (const fitId of product.fitIds) {
        const chart = seedCatalog.sizeCharts.find((c) => c.productId === product.id && c.fitId === fitId);
        expect(chart, `${product.id} ${fitId}`).toBeDefined();
        expect(chart!.rows.map((r) => r.sizeId)).toEqual(seedCatalog.sizes.map((s) => s.id));
        for (const row of chart!.rows) expect(Object.keys(row.sleeve).sort()).toEqual([...sleevesOf(product)].sort());
      }
    }
  });

  it("grow with each size", () => {
    for (const chart of seedCatalog.sizeCharts) {
      for (let i = 1; i < chart.rows.length; i++) {
        const [a, b] = [chart.rows[i - 1]!, chart.rows[i]!];
        expect(b.chest, `${chart.productId} ${chart.fitId} ${b.sizeId}`).toBeGreaterThan(a.chest);
        expect(b.length).toBeGreaterThan(a.length);
        for (const sl of Object.keys(a.sleeve) as ("short" | "long")[]) expect(b.sleeve[sl]!).toBeGreaterThanOrEqual(a.sleeve[sl]!);
      }
    }
  });

  it("make oversized wider and longer, and boxy wider and shorter, than regular", () => {
    const row = (fitId: string) => sizeChartFor(seedCatalog, "tshirt", fitId)!.rows.find((r) => r.sizeId === "M")!;
    expect(row("oversized").chest).toBeGreaterThan(row("regular").chest);
    expect(row("oversized").length).toBeGreaterThan(row("regular").length);
    expect(row("boxy").chest).toBeGreaterThan(row("regular").chest);
    expect(row("boxy").length).toBeLessThan(row("regular").length);
  });

  it("fall back to the regular fit when a fit has no chart", () => {
    expect(sizeChartFor(seedCatalog, "polo", "boxy")?.fitId).toBe("regular");
    expect(sizeChartFor(seedCatalog, "ghost", "regular")).toBeUndefined();
  });

  it("are accepted by the price editor's checks, and silly numbers aren't", () => {
    const sheet = priceSheetOf(seedCatalog);
    expect(priceSheetSchema.safeParse(sheet).success).toBe(true);
    sheet.sizeCharts![0]!.rows[0]!.chest = 0;
    expect(priceSheetSchema.safeParse(sheet).success).toBe(false);
  });
});

describe("inches", () => {
  it("are rounded to the nearest quarter", () => {
    expect(cmToInches(2.54)).toBe(1);
    expect(cmToInches(56)).toBe(22);
    expect(cmToInches(71)).toBe(28);
  });
});
