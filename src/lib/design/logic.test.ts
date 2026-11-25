import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import type { DesignSelection } from "@/lib/pricing/types";
import { addElement, newClipartElement } from "./elements";
import { addPrint, defaultDesign, methodBlock, normalizeDesign, removePrint, switchProduct, updatePrint } from "./logic";
import { panelBox, printBounds } from "./sides";
import type { ClipartElement } from "./types";

/** Adds a print on a side and returns the design and the print's id. */
function withPrint(d: DesignSelection, side: Parameters<typeof addPrint>[2]): [DesignSelection, string] {
  const r = addPrint(seedCatalog, d, side);
  expect(r.printId).toBeTruthy();
  return [r.design, r.printId!];
}

describe("design logic", () => {
  it("builds a valid default design", () => {
    const d = defaultDesign(seedCatalog, "tshirt");
    expect(d).toMatchObject({ productId: "tshirt", sleeve: "short", gsm: 180, fabricId: "cotton", bodyColorId: "black" });
  });

  it("falls back to the first product for unknown ids", () => {
    expect(defaultDesign(seedCatalog, "cape").productId).toBe("hoodie");
  });

  it("keeps shared choices when switching products and drops prints on sides the new one lacks", () => {
    let d = defaultDesign(seedCatalog, "hoodie");
    d = { ...d, gsm: 320, bodyColorId: "navy", partColors: { hoodLining: "mustard" } };
    [d] = withPrint(d, "front");
    [d] = withPrint(d, "hood");
    const tee = switchProduct(seedCatalog, d, "tshirt");
    expect(tee.productId).toBe("tshirt");
    expect(tee.sleeve).toBe("short");
    expect(tee.gsm).toBe(180);
    expect(tee.fabricId).toBe("cotton");
    expect(tee.bodyColorId).toBe("navy");
    expect(tee.partColors).toEqual({});
    expect(tee.prints.map((p) => p.areaId)).toEqual(["front"]);
  });

  it("adds empty prints anywhere, several per side", () => {
    let d = defaultDesign(seedCatalog, "tshirt");
    const [d1, first] = withPrint(d, "front");
    expect(d1.prints).toEqual([{ id: first, areaId: "front", methodId: "dtf", tier: "S", elements: [] }]);
    const [d2, second] = withPrint(d1, "front");
    expect(second).not.toBe(first);
    expect(d2.prints.map((p) => p.areaId)).toEqual(["front", "front"]);
    expect(removePrint(d2, first).prints.map((p) => p.id)).toEqual([second]);
    // The hood is only on hoodies, and a side holds at most six prints.
    expect(addPrint(seedCatalog, d, "hood").printId).toBeNull();
    for (let i = 0; i < 6; i++) [d] = withPrint(d, "back");
    expect(addPrint(seedCatalog, d, "back").printId).toBeNull();
  });

  it("shrinks artwork to fit a smaller print type and clamps ink colors", () => {
    let [d, id] = withPrint(defaultDesign(seedCatalog, "tshirt"), "back");
    d = addElement(seedCatalog, d, id, { ...newClipartElement(panelBox("tshirt", "short", "back"), "star", "#fff"), w: 200 });
    expect(d.prints[0]!.tier).toBe("M");
    d = updatePrint(seedCatalog, d, id, { methodId: "wovenPatch" });
    expect(d.prints[0]).toMatchObject({ methodId: "wovenPatch", tier: "S" });
    expect((d.prints[0]!.elements![0] as ClipartElement).w).toBeLessThanOrEqual(100);
    d = updatePrint(seedCatalog, d, id, { methodId: "screen", colorCount: 12 });
    expect(d.prints[0]).toMatchObject({ methodId: "screen", colorCount: 6 });
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
      prints: [{ id: "a", areaId: "front", methodId: "dtf", tier: "L", elements: [] }, { id: "b", areaId: "nowhere", methodId: "dtf", tier: "S" }],
    });
    expect(d).toMatchObject({ sleeve: "long", gsm: 280, bodyColorId: "black", partColors: {} });
    // The size comes from the artwork: an empty print is Small.
    expect(d.prints).toEqual([{ id: "a", areaId: "front", methodId: "dtf", tier: "S", elements: [] }]);
  });

  it("turns prints saved for fixed areas into free prints with the artwork where it was", () => {
    const star = (x: number, y: number) => ({ id: `s${x}`, type: "clipart" as const, clipartId: "star", w: 60, color: "#fff", x, y, rotation: 0 });
    const d = normalizeDesign(seedCatalog, {
      productId: "hoodie",
      sleeve: "long",
      prints: [
        { areaId: "leftChest", methodId: "embroidery", tier: "S", elements: [star(50, 50)] },
        { areaId: "fullBack", methodId: "dtf", tier: "L", elements: [star(150, 100)] },
        { areaId: "hood", methodId: "dtf", tier: "S", elements: [star(50, 50)] },
        { areaId: "rightSleeve", methodId: "dtf", tier: "M", elements: [star(40, 40)] },
      ] as unknown as DesignSelection["prints"],
    });
    expect(d.prints.map((p) => p.areaId)).toEqual(["front", "back", "hood", "rightSleeve"]);
    expect(new Set(d.prints.map((p) => p.id)).size).toBe(4);
    const at = (i: number) => d.prints[i]!.elements![0]!;
    // Left chest: 10.5 cm to the wearer's left (the viewer's right) of the middle, 6 cm below the neckline.
    expect(at(0)).toMatchObject({ x: 50 + (20 + 10.5 - 5) * 10, y: 50 + (6 - 2) * 10 });
    expect(at(1)).toMatchObject({ x: 150 + (20 - 15) * 10, y: 100 + (5 - 2) * 10 });
    expect(at(2)).toMatchObject({ x: 50 + (9 - 5) * 10, y: 50 + (13.5 - 11) * 10 });
    expect(at(3)).toMatchObject({ x: 40 + (5 - 4) * 10, y: 40 + (9 - 2) * 10 });
    expect(d.prints[0]!.tier).toBe("S");
  });

  it("keeps saved artwork on the side's panel", () => {
    const d = normalizeDesign(seedCatalog, {
      productId: "tshirt",
      prints: [{ id: "a", areaId: "leftSleeve", methodId: "dtf", tier: "S", elements: [{ id: "e", type: "clipart", clipartId: "star", w: 60, color: "#fff", x: 900, y: 900, rotation: 0 }] }],
    });
    const panel = panelBox("tshirt", "short", "leftSleeve");
    const b = printBounds(d.prints[0]!.elements)!;
    expect(b.x + b.w).toBeLessThanOrEqual(panel.w + 0.01);
    expect(b.y + b.h).toBeLessThanOrEqual(panel.h + 0.01);
  });
});
