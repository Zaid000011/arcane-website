import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { allowedTiers, defaultDesign, methodBlock, normalizeDesign, switchProduct, togglePrint, updatePrint } from "./logic";

describe("design logic", () => {
  it("builds a valid default design", () => {
    const d = defaultDesign(seedCatalog, "tshirt");
    expect(d).toMatchObject({ productId: "tshirt", sleeve: "short", gsm: 180, fabricId: "cotton", bodyColorId: "black" });
  });

  it("falls back to the first product for unknown ids", () => {
    expect(defaultDesign(seedCatalog, "cape").productId).toBe("hoodie");
  });

  it("keeps shared choices when switching products and drops the rest", () => {
    let d = defaultDesign(seedCatalog, "hoodie");
    d = { ...d, gsm: 320, bodyColorId: "navy", partColors: { hoodLining: "mustard" } };
    d = togglePrint(seedCatalog, d, "leftChest");
    d = togglePrint(seedCatalog, d, "hood");
    const tee = switchProduct(seedCatalog, d, "tshirt");
    expect(tee.productId).toBe("tshirt");
    expect(tee.sleeve).toBe("short");
    expect(tee.gsm).toBe(180);
    expect(tee.fabricId).toBe("cotton");
    expect(tee.bodyColorId).toBe("navy");
    expect(tee.partColors).toEqual({});
    expect(tee.prints.map((p) => p.areaId)).toEqual(["leftChest"]);
  });

  it("adds prints with a default method and size that fit the area", () => {
    const d = togglePrint(seedCatalog, defaultDesign(seedCatalog, "tshirt"), "frontCenter");
    expect(d.prints).toEqual([{ areaId: "frontCenter", methodId: "dtf", tier: "M", elements: [] }]);
    const chest = togglePrint(seedCatalog, d, "leftChest");
    expect(chest.prints[1]).toEqual({ areaId: "leftChest", methodId: "dtf", tier: "S", elements: [] });
    expect(togglePrint(seedCatalog, chest, "frontCenter").prints).toHaveLength(1);
  });

  it("clamps print sizes to the method and area", () => {
    let d = togglePrint(seedCatalog, defaultDesign(seedCatalog, "tshirt"), "fullBack");
    d = updatePrint(seedCatalog, d, "fullBack", { methodId: "wovenPatch" });
    expect(d.prints[0]).toMatchObject({ methodId: "wovenPatch", tier: "S" });
    d = updatePrint(seedCatalog, d, "fullBack", { methodId: "screen", tier: "L", colorCount: 12 });
    expect(d.prints[0]).toMatchObject({ methodId: "screen", tier: "L", colorCount: 6 });
  });

  it("limits sleeve prints on short sleeves", () => {
    expect(allowedTiers(seedCatalog, "short", "leftSleeve", "dtf")).toEqual(["S"]);
    expect(allowedTiers(seedCatalog, "long", "leftSleeve", "dtf")).toEqual(["S", "M"]);
  });

  it("explains why a method is blocked", () => {
    const poly = { ...defaultDesign(seedCatalog, "tshirt"), fabricId: "polyester" };
    expect(methodBlock(seedCatalog, poly, "dtg")).toBe("fabric");
    expect(methodBlock(seedCatalog, poly, "sublimation")).toBe("lightColor");
    expect(methodBlock(seedCatalog, { ...poly, bodyColorId: "white" }, "sublimation")).toBeNull();
  });

  it("repairs a saved design with stale values", () => {
    const d = normalizeDesign(seedCatalog, {
      productId: "hoodie",
      sleeve: "short",
      gsm: 999,
      bodyColorId: "unicorn",
      partColors: { hoodLining: "red", collar: "red" },
      prints: [{ areaId: "leftChest", methodId: "dtf", tier: "L" }, { areaId: "nowhere", methodId: "dtf", tier: "S" }],
    });
    expect(d).toMatchObject({ sleeve: "long", gsm: 280, bodyColorId: "black", partColors: {} });
    expect(d.prints).toEqual([{ areaId: "leftChest", methodId: "dtf", tier: "S", elements: [] }]);
  });
});
