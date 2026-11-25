import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import type { DesignSelection } from "@/lib/pricing/types";
import { designIssues } from "./checks";
import {
  addElement,
  defaultClassText,
  duplicateElement,
  findElement,
  fitMeasuredText,
  moveLayer,
  newClipartElement,
  newImageElement,
  newTextElement,
  removeElement,
  updateElement,
} from "./elements";
import { textShapeKey } from "./geometry";
import { addPrint, defaultDesign, updatePrint } from "./logic";
import { panelBox, printBounds } from "./sides";
import type { ClipartElement, ImageElement, TextElement } from "./types";

/** A t-shirt with one empty print on a side, and that print's id. */
function withPrint(side: "front" | "back" | "leftSleeve" = "front", sleeve: "short" | "long" = "short"): [DesignSelection, string] {
  const r = addPrint(seedCatalog, { ...defaultDesign(seedCatalog, "tshirt"), sleeve }, side);
  return [r.design, r.printId!];
}
const elements = (d: DesignSelection, id: string) => d.prints.find((p) => p.id === id)!.elements!;
const front = panelBox("tshirt", "short", "front");

describe("adding artwork", () => {
  it("starts new clip-art big, across the chest", () => {
    const [d0, id] = withPrint();
    const d = addElement(seedCatalog, d0, id, newClipartElement(front, "star", "#fff"));
    const el = elements(d, id)[0] as ClipartElement;
    expect(el.w).toBeGreaterThanOrEqual(100);
    expect(el).toMatchObject({ x: front.w / 2, y: 140 });
    expect(d.prints[0]!.tier).toBe("M");
  });

  it("fits a new image on the side", () => {
    const el = newImageElement(front, { assetId: "a", name: "tall.png", pxW: 500, pxH: 2000, vector: false });
    expect(el.w * el.aspect).toBeLessThanOrEqual(300.001);
    const wide = newImageElement(front, { assetId: "b", name: "wide.png", pxW: 2000, pxH: 1000, vector: false });
    expect(wide.w).toBeGreaterThan(200);
  });

  it("creates big, readable default text that fits", () => {
    const t = newTextElement(front, "CLASS OF 2027", "anton", "#fff");
    expect(t.size).toBeGreaterThan(20);
    expect(t.size * 13 * 0.62).toBeLessThanOrEqual(front.w + 0.01);
    expect(t.rotation).toBe(0);
  });

  it("runs default text down a sleeve", () => {
    const sleeve = panelBox("tshirt", "long", "leftSleeve");
    const t = newTextElement(sleeve, "ARCANE", "anton", "#fff");
    expect(t.rotation).toBe(90);
    expect(t.size).toBeLessThanOrEqual(sleeve.w * 0.6 + 0.01);
  });

  it("suggests the next graduating class", () => {
    expect(defaultClassText("en", new Date(2026, 10, 23))).toBe("CLASS OF 2027");
    expect(defaultClassText("en", new Date(2027, 2, 1))).toBe("CLASS OF 2027");
    expect(defaultClassText("ar", new Date(2026, 10, 23))).toBe("دفعة 2027");
  });
});

describe("editing artwork", () => {
  it("lets artwork move anywhere on the side, but not off it", () => {
    const img = newImageElement(front, { assetId: "a", name: "logo.png", pxW: 1000, pxH: 1000, vector: false });
    const [d0, id] = withPrint();
    let d = addElement(seedCatalog, d0, id, { ...img, w: 80 });
    d = updateElement(seedCatalog, d, id, img.id, { x: 60, y: 500 });
    expect(findElement(d, id, img.id)).toMatchObject({ x: 60, y: 500 });
    d = updateElement(seedCatalog, d, id, img.id, { x: 9000, y: -40 });
    const moved = findElement(d, id, img.id) as ImageElement;
    expect(moved.x).toBeCloseTo(front.w - moved.w / 2);
    expect(moved.y).toBeCloseTo((moved.w * moved.aspect) / 2);
  });

  it("only constrains text when its real size is known", () => {
    const t = newTextElement(front, "HELLO", "anton", "#fff");
    const [d0, id] = withPrint();
    let d = addElement(seedCatalog, d0, id, t);
    d = updateElement(seedCatalog, d, id, t.id, { x: 900 });
    expect((findElement(d, id, t.id) as TextElement).x).toBe(900);

    const m = { bbox: { x: -40, y: -10, w: 80, h: 20 }, size: t.size, shapeKey: textShapeKey(t) };
    d = updateElement(seedCatalog, d, id, t.id, { x: 900 }, m);
    expect((findElement(d, id, t.id) as TextElement).x).toBe(front.w - 40);
  });

  it("fits text after the browser measures it, and is a no-op when it fits", () => {
    const [d0, id] = withPrint();
    const t = { ...newTextElement(front, "A VERY LONG LINE", "anton", "#fff"), size: 40, x: 200 };
    const d = addElement(seedCatalog, d0, id, t);
    const tooWide = { [t.id]: { bbox: { x: -400, y: -20, w: 800, h: 40 }, size: 40, shapeKey: textShapeKey(t) } };
    const fitted = fitMeasuredText(seedCatalog, d, tooWide);
    expect((findElement(fitted, id, t.id) as TextElement).size).toBeCloseTo(20);
    const fine = { [t.id]: { bbox: { x: -50, y: -20, w: 100, h: 40 }, size: 40, shapeKey: textShapeKey(t) } };
    expect(fitMeasuredText(seedCatalog, d, fine)).toBe(d);
  });

  it("works the print's size out from all its artwork", () => {
    const [d0, id] = withPrint("back");
    const a = { ...newClipartElement(front, "star", "#fff"), w: 60, x: 100, y: 100 };
    const b = { ...newClipartElement(front, "star", "#fff"), w: 60, x: 250, y: 300 };
    const d = addElement(seedCatalog, addElement(seedCatalog, d0, id, a), id, b);
    const bounds = printBounds(elements(d, id))!;
    expect(bounds).toMatchObject({ x: 70, y: 70, w: 210, h: 260 });
    expect(d.prints[0]!.tier).toBe("M");
  });

  it("won't grow a print past what its print type allows", () => {
    let [d, id] = withPrint();
    d = updatePrint(seedCatalog, d, id, { methodId: "wovenPatch" });
    const star = { ...newClipartElement(front, "star", "#fff"), w: 60, x: 100, y: 100 };
    d = addElement(seedCatalog, d, id, star);
    const bigger = updateElement(seedCatalog, d, id, star.id, { w: 140 });
    expect(bigger).toBe(d);
    expect(updateElement(seedCatalog, d, id, star.id, { w: 90 })).not.toBe(d);
  });

  it("duplicates, reorders and removes", () => {
    const a = newClipartElement(front, "star", "#fff");
    const [d0, id] = withPrint();
    let d = addElement(seedCatalog, d0, id, a);
    const dup = duplicateElement(seedCatalog, d, id, a.id);
    d = dup.design;
    expect(elements(d, id).map((e) => e.id)).toEqual([a.id, dup.newId]);
    d = moveLayer(d, id, dup.newId!, -1);
    expect(elements(d, id).map((e) => e.id)).toEqual([dup.newId, a.id]);
    d = removeElement(d, id, a.id);
    expect(elements(d, id)).toHaveLength(1);
  });
});

describe("artwork checks", () => {
  it("flags empty prints and low-resolution images", () => {
    const [empty] = withPrint();
    expect(designIssues(empty)).toEqual([{ code: "emptyPrintArea", severity: "warning", params: { areaId: "front", n: 1 } }]);

    const add = (el: ImageElement) => {
      const [d, id] = withPrint();
      return addElement(seedCatalog, d, id, el);
    };
    const sharp = { ...newImageElement(front, { assetId: "a", name: "sharp.png", pxW: 3000, pxH: 3000, vector: false }), w: 200 };
    expect(designIssues(add(sharp))).toEqual([]);

    const soft = { ...sharp, id: "soft", name: "soft.png", pxW: 1000, pxH: 1000, w: 200 };
    expect(designIssues(add(soft))[0]).toMatchObject({ code: "artworkLowRes", severity: "warning" });

    const blurry = { ...sharp, id: "blurry", name: "tiny.jpg", pxW: 500, pxH: 500, w: 200 };
    expect(designIssues(add(blurry))[0]).toMatchObject({ code: "artworkTooLowRes", severity: "error" });

    const vector = { ...blurry, id: "vec", vector: true };
    expect(designIssues(add(vector))).toEqual([]);
  });
});
