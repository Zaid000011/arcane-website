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
import { defaultDesign, togglePrint, updatePrint } from "./logic";
import type { ClipartElement, ImageElement, TextElement } from "./types";

const withPrint = (areaId = "frontCenter"): DesignSelection => togglePrint(seedCatalog, defaultDesign(seedCatalog, "tshirt"), areaId);
const elements = (d: DesignSelection, areaId = "frontCenter") => d.prints.find((p) => p.areaId === areaId)!.elements!;
const box = { w: 210, h: 300 };

describe("adding artwork", () => {
  it("places new clip-art inside the box", () => {
    const el = newClipartElement(box, "star", "#fff");
    const d = addElement(seedCatalog, withPrint(), "frontCenter", el);
    expect(elements(d)).toHaveLength(1);
    expect(elements(d)[0]).toMatchObject({ x: 105, y: 150 });
  });

  it("fits a new image to the box", () => {
    const el = newImageElement(box, { assetId: "a", name: "tall.png", pxW: 500, pxH: 2000, vector: false });
    expect(el.w * el.aspect).toBeLessThanOrEqual(box.h * 0.8 + 0.001);
  });

  it("shrinks clip-art added to a small chest box", () => {
    const d = addElement(seedCatalog, withPrint("leftChest"), "leftChest", { ...newClipartElement(box, "star", "#fff"), w: 500 });
    expect((elements(d, "leftChest")[0] as ClipartElement).w).toBeCloseTo(100);
  });

  it("creates readable default text", () => {
    const t = newTextElement(box, "CLASS OF 2027", "anton", "#fff");
    expect(t.size).toBeGreaterThan(5);
    expect(t.size * 13 * 0.62).toBeLessThanOrEqual(box.w + 0.01);
  });

  it("suggests the next graduating class", () => {
    expect(defaultClassText("en", new Date(2026, 10, 23))).toBe("CLASS OF 2027");
    expect(defaultClassText("en", new Date(2027, 2, 1))).toBe("CLASS OF 2027");
    expect(defaultClassText("ar", new Date(2026, 10, 23))).toBe("دفعة 2027");
  });
});

describe("editing artwork", () => {
  it("keeps moved images inside the box", () => {
    const img = newImageElement(box, { assetId: "a", name: "logo.png", pxW: 1000, pxH: 1000, vector: false });
    let d = addElement(seedCatalog, withPrint(), "frontCenter", img);
    d = updateElement(seedCatalog, d, "frontCenter", img.id, { x: 900, y: -40 });
    const moved = findElement(d, "frontCenter", img.id) as ImageElement;
    expect(moved.x).toBeCloseTo(box.w - moved.w / 2);
    expect(moved.y).toBeCloseTo((moved.w * moved.aspect) / 2);
  });

  it("only constrains text when its real size is known", () => {
    const t = newTextElement(box, "HELLO", "anton", "#fff");
    let d = addElement(seedCatalog, withPrint(), "frontCenter", t);
    d = updateElement(seedCatalog, d, "frontCenter", t.id, { x: 500 });
    expect((findElement(d, "frontCenter", t.id) as TextElement).x).toBe(500);

    const m = { bbox: { x: -40, y: -10, w: 80, h: 20 }, size: t.size, shapeKey: textShapeKey(t) };
    d = updateElement(seedCatalog, d, "frontCenter", t.id, { x: 500 }, m);
    expect((findElement(d, "frontCenter", t.id) as TextElement).x).toBe(170);
  });

  it("fits text after the browser measures it, and is a no-op when it fits", () => {
    const t = { ...newTextElement(box, "A VERY LONG LINE", "anton", "#fff"), size: 40, x: 105 };
    const d = addElement(seedCatalog, withPrint(), "frontCenter", t);
    const tooWide = { [t.id]: { bbox: { x: -200, y: -20, w: 400, h: 40 }, size: 40, shapeKey: textShapeKey(t) } };
    const fitted = fitMeasuredText(seedCatalog, d, tooWide);
    expect((findElement(fitted, "frontCenter", t.id) as TextElement).size).toBeCloseTo(21);
    const fine = { [t.id]: { bbox: { x: -50, y: -20, w: 100, h: 40 }, size: 40, shapeKey: textShapeKey(t) } };
    expect(fitMeasuredText(seedCatalog, d, fine)).toBe(d);
  });

  it("duplicates, reorders and removes", () => {
    const a = newClipartElement(box, "star", "#fff");
    let d = addElement(seedCatalog, withPrint(), "frontCenter", a);
    const dup = duplicateElement(seedCatalog, d, "frontCenter", a.id);
    d = dup.design;
    expect(elements(d).map((e) => e.id)).toEqual([a.id, dup.newId]);
    d = moveLayer(d, "frontCenter", dup.newId!, -1);
    expect(elements(d).map((e) => e.id)).toEqual([dup.newId, a.id]);
    d = removeElement(d, "frontCenter", a.id);
    expect(elements(d)).toHaveLength(1);
  });

  it("rescales artwork when the print size changes", () => {
    let d = addElement(seedCatalog, withPrint(), "frontCenter", { ...newClipartElement(box, "star", "#fff"), w: 90 });
    d = updatePrint(seedCatalog, d, "frontCenter", { tier: "S" });
    const el = elements(d)[0] as ClipartElement;
    expect(el.w).toBeCloseTo(90 * (100 / 300));
    expect(el.x).toBeCloseTo(50);
  });
});

describe("artwork checks", () => {
  it("flags empty print areas and low-resolution images", () => {
    expect(designIssues(withPrint())).toEqual([{ code: "emptyPrintArea", severity: "warning", params: { areaId: "frontCenter" } }]);

    const sharp = newImageElement(box, { assetId: "a", name: "sharp.png", pxW: 3000, pxH: 3000, vector: false });
    expect(designIssues(addElement(seedCatalog, withPrint(), "frontCenter", sharp))).toEqual([]);

    const soft = { ...sharp, id: "soft", name: "soft.png", pxW: 1000, pxH: 1000, w: 200 };
    expect(designIssues(addElement(seedCatalog, withPrint(), "frontCenter", soft))[0]).toMatchObject({ code: "artworkLowRes", severity: "warning" });

    const blurry = { ...sharp, id: "blurry", name: "tiny.jpg", pxW: 500, pxH: 500, w: 200 };
    expect(designIssues(addElement(seedCatalog, withPrint(), "frontCenter", blurry))[0]).toMatchObject({ code: "artworkTooLowRes", severity: "error" });

    const vector = { ...blurry, id: "vec", vector: true };
    expect(designIssues(addElement(seedCatalog, withPrint(), "frontCenter", vector))).toEqual([]);
  });
});
