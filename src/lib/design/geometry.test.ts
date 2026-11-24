import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import {
  constrainElement,
  dpiLevel,
  imageDpi,
  measuredFor,
  printBoxMm,
  rescaleElements,
  rotatedExtents,
  snap,
  textShapeKey,
  tierBoxCm,
} from "./geometry";
import type { ClipartElement, ImageElement, TextElement } from "./types";

const area = (id: string) => seedCatalog.printAreas.find((a) => a.id === id)!;
const clip = (over: Partial<ClipartElement> = {}): ClipartElement => ({ id: "c", type: "clipart", clipartId: "star", w: 20, color: "#fff", x: 50, y: 50, rotation: 0, ...over });
const image = (over: Partial<ImageElement> = {}): ImageElement => ({
  id: "i", type: "image", assetId: "a", name: "logo.png", w: 100, aspect: 1, pxW: 1200, pxH: 1200, vector: false, x: 50, y: 50, rotation: 0, ...over,
});
const text = (over: Partial<TextElement> = {}): TextElement => ({
  id: "t", type: "text", text: "CLASS", fontId: "anton", size: 20, color: "#fff", outline: 0, outlineColor: "#000", letterSpacing: 0, curve: 0, x: 50, y: 50, rotation: 0, ...over,
});

describe("print boxes", () => {
  it("sizes boxes by tier and keeps the area's orientation", () => {
    expect(tierBoxCm(area("frontCenter"), "M")).toEqual([21, 30]);
    expect(tierBoxCm(area("leftChest"), "S")).toEqual([10, 10]);
    expect(tierBoxCm(area("backUpper"), "M")).toEqual([30, 10]);
    expect(tierBoxCm(area("fullFront"), "AO")).toEqual([30, 42]);
    expect(printBoxMm(area("fullBack"), "L")).toEqual({ w: 300, h: 420 });
  });
});

describe("keeping artwork inside the box", () => {
  const box = { w: 100, h: 100 };

  it("moves an element back inside", () => {
    expect(constrainElement(clip({ x: -5, y: 120 }), box)).toMatchObject({ x: 10, y: 90 });
  });

  it("leaves an element that already fits untouched", () => {
    const el = clip({ x: 40, y: 60 });
    expect(constrainElement(el, box)).toBe(el);
  });

  it("shrinks an element that is bigger than the box", () => {
    const fitted = constrainElement(image({ w: 300, aspect: 1 }), { w: 100, h: 50 });
    expect(fitted.w).toBeCloseTo(50);
    expect(fitted).toMatchObject({ x: 50, y: 25 });
  });

  it("accounts for rotation", () => {
    const ext = rotatedExtents({ x: -10, y: -10, w: 20, h: 20 }, 45);
    expect(ext.maxX).toBeCloseTo(Math.SQRT2 * 10);
    expect(constrainElement(clip({ x: 5, rotation: 45 }), box).x).toBeCloseTo(Math.SQRT2 * 10);
  });

  it("uses the measured text bounds", () => {
    const fitted = constrainElement(text({ x: 0 }), box, { x: -30, y: -10, w: 60, h: 20 });
    expect(fitted.x).toBe(30);
    const shrunk = constrainElement(text(), box, { x: -100, y: -10, w: 200, h: 20 });
    expect(shrunk.size).toBeCloseTo(10);
  });

  it("rescales a layout when the box gets smaller", () => {
    const [el] = rescaleElements([clip({ x: 105, y: 150, w: 60 })], { w: 210, h: 300 }, { w: 100, h: 100 });
    expect(el!.x).toBeCloseTo(50);
    expect(el!.y).toBeCloseTo(50);
    expect((el as ClipartElement).w).toBeCloseTo(20);
  });

  it("snaps near a guide", () => {
    expect(snap(48.5, 50, 2)).toEqual({ value: 50, snapped: true });
    expect(snap(45, 50, 2)).toEqual({ value: 45, snapped: false });
  });
});

describe("print quality", () => {
  it("computes DPI at the printed width", () => {
    expect(imageDpi(image({ pxW: 3000, w: 254 }))).toBe(300);
    expect(imageDpi(image({ pxW: 1000, w: 254 }))).toBe(100);
    expect(imageDpi(image({ vector: true }))).toBe(Number.POSITIVE_INFINITY);
  });

  it("grades DPI", () => {
    expect(dpiLevel(320)).toBe("great");
    expect(dpiLevel(200)).toBe("ok");
    expect(dpiLevel(120)).toBe("low");
    expect(dpiLevel(80)).toBe("tooLow");
  });
});

describe("text measurements", () => {
  it("scales a measurement to the current size and ignores stale ones", () => {
    const el = text({ size: 40 });
    const m = { bbox: { x: -50, y: -10, w: 100, h: 20 }, size: 20, shapeKey: textShapeKey(el) };
    expect(measuredFor(el, m)).toEqual({ x: -100, y: -20, w: 200, h: 40 });
    expect(measuredFor(text({ text: "OTHER" }), m)).toBeUndefined();
  });
});
