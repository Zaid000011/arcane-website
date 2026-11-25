import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { areaRect, fitToMethod, maxTierOf, placeRect, printBounds, printTier, rectPlacementText, sidePanel, sidesFor, tierForSize } from "./sides";
import type { DesignElement } from "./types";

const method = (id: string) => seedCatalog.printMethods.find((m) => m.id === id)!;
const square = (cm: number, x = 200, y = 200): DesignElement => ({ id: `s${cm}`, type: "clipart", clipartId: "star", w: cm * 10, color: "#fff", x, y, rotation: 0 });

describe("print sides", () => {
  it("gives hoodies a hood and everything else four sides", () => {
    expect(sidesFor("hoodie")).toEqual(["front", "back", "leftSleeve", "rightSleeve", "hood"]);
    expect(sidesFor("tshirt")).toEqual(["front", "back", "leftSleeve", "rightSleeve"]);
  });

  it("sizes each side's printable panel from the garment", () => {
    expect(sidePanel("tshirt", "short", "front")).toEqual({ wCm: 40, hCm: 59, topCm: 2 });
    expect(sidePanel("hoodie", "long", "back")).toEqual({ wCm: 40, hCm: 56.5, topCm: 2 });
    expect(sidePanel("tshirt", "short", "leftSleeve").hCm).toBeLessThan(sidePanel("tshirt", "long", "leftSleeve").hCm);
  });

  it("prices by size: Small, A4, A3, then all-over", () => {
    expect(tierForSize(10, 10)).toBe("S");
    expect(tierForSize(10.5, 4)).toBe("M");
    expect(tierForSize(21, 30)).toBe("M");
    expect(tierForSize(30, 21)).toBe("M");
    expect(tierForSize(30, 42)).toBe("L");
    expect(tierForSize(31, 20)).toBe("L");
    expect(tierForSize(10, 45)).toBe("AO");
    expect(printTier({ elements: [] })).toBe("S");
    expect(printTier({ elements: [square(25)] })).toBe("L");
  });

  it("knows each print type's biggest size and shrinks artwork to it", () => {
    expect(maxTierOf(method("wovenPatch"))).toBe("S");
    expect(maxTierOf(method("sublimation"))).toBe("AO");
    const shrunk = fitToMethod([square(20, 200, 200)], method("wovenPatch"));
    const b = printBounds(shrunk)!;
    expect(b.w).toBeLessThanOrEqual(100);
    // Shrinks around its middle.
    expect(b.x + b.w / 2).toBeCloseTo(200);
  });

  it("turns a spot on a panel into a place on the garment and a workshop note", () => {
    const front = placeRect("tshirt", "short", "front", { x: 255, y: 40, w: 100, h: 100 });
    expect(front).toEqual({ side: "front", cxCm: 10.5, topCm: 6, wCm: 10, hCm: 10 });
    expect(rectPlacementText(front)).toBe("Top of the print 6 cm below the front neckline, its middle 10.5 cm to the wearer's left of the center.");
    const back = placeRect("tshirt", "short", "back", { x: 50, y: 30, w: 300, h: 100 });
    expect(rectPlacementText(back)).toBe("Top of the print 5 cm below the back neckline, centered.");
    const hood = placeRect("hoodie", "long", "hood", { x: 40, y: 25, w: 100, h: 100 });
    expect(hood).toMatchObject({ side: "hood", cxCm: 0, topCm: 11 });
  });

  it("places name and number areas the same way", () => {
    expect(areaRect("leftChest", "short", 10, 10)).toEqual({ side: "front", cxCm: 10.5, topCm: 6, wCm: 10, hCm: 10 });
    expect(areaRect("backUpper", "long", 30, 10)).toEqual({ side: "back", cxCm: -0, topCm: 6, wCm: 30, hCm: 10 });
    expect(areaRect("leftSleeve", "long", 8, 30)).toMatchObject({ side: "leftSleeve", topCm: 9 });
  });
});
