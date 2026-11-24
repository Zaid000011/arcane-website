import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { renderJob } from "./jobs";
import { applyPrint, fabricLookId, fabricSurface, hasDistinctInside, hexToLinear, shade, type Art } from "./surface";

const SIZE = 64;

function fabric(fabricId: string, kind: string, color: string, side: "outside" | "inside" = "outside") {
  return shade(fabricSurface({ fabricId, kind, color, size: SIZE, mmPerPx: 12 / SIZE, side }));
}

/** Average color of a picture, as 0–255 sRGB. */
function average(px: Uint8ClampedArray): [number, number, number] {
  const sum = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) sum[c]! += px[i + c]!;
  const n = px.length / 4;
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

const difference = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  return d / a.length;
};

describe("fabric close-ups", () => {
  it("draws every catalog fabric as a full, opaque picture", () => {
    for (const product of seedCatalog.products) {
      for (const f of product.fabrics) {
        const px = fabric(f.id, f.kind, "#7A0A0A");
        expect(px.length).toBe(SIZE * SIZE * 4);
        for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
      }
    }
  });

  it("keeps the garment's own color on average", () => {
    for (const hex of ["#1C2541", "#C1121F", "#B9BBBF", "#F7F7F5", "#1F4D2E"]) {
      const [r, g, b] = average(fabric("cotton", "cotton", hex));
      const n = parseInt(hex.slice(1), 16);
      const want = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(Math.abs(r - want[0]!)).toBeLessThan(34);
      expect(Math.abs(g - want[1]!)).toBeLessThan(34);
      expect(Math.abs(b - want[2]!)).toBeLessThan(34);
    }
  });

  it("makes each fabric look different", () => {
    const looks = ["cotton", "polyester", "pique", "melton"].map((id) => fabric(id, "cotton", "#B9BBBF"));
    for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) expect(difference(looks[i]!, looks[j]!)).toBeGreaterThan(4);
    expect(difference(fabric("cottonFleece", "cotton", "#B9BBBF"), fabric("cottonFleece", "cotton", "#B9BBBF", "inside"))).toBeGreaterThan(4);
  });

  it("draws the same picture every time", () => {
    expect(difference(fabric("frenchTerry", "cotton", "#5E1224", "inside"), fabric("frenchTerry", "cotton", "#5E1224", "inside"))).toBe(0);
  });

  it("falls back by fabric kind and knows which insides are worth showing", () => {
    expect(fabricLookId("someNewFleece", "polyester")).toBe("polyester");
    expect(fabricLookId("cottonFleece", "cotton")).toBe("cottonFleece");
    expect(hasDistinctInside("frenchTerry", "cotton")).toBe(true);
    expect(hasDistinctInside("cotton", "cotton")).toBe(false);
  });
});

describe("print close-ups", () => {
  /** A gold square in the middle third. */
  function squareArt(): Art {
    const n = SIZE * SIZE;
    const art: Art = { a: new Float32Array(n), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) };
    const [r, g, b] = hexToLinear("#C9A227");
    for (let y = Math.floor(SIZE / 3); y < Math.floor((2 * SIZE) / 3); y++) {
      for (let x = Math.floor(SIZE / 3); x < Math.floor((2 * SIZE) / 3); x++) {
        const i = y * SIZE + x;
        art.a[i] = 1;
        art.r[i] = r;
        art.g[i] = g;
        art.b[i] = b;
      }
    }
    return art;
  }

  it("changes only where the artwork is, and every method looks different", () => {
    const plain = renderJob({ type: "fabric", fabricId: "cotton", kind: "cotton", color: "#151515", size: SIZE, side: "outside" });
    const pictures = seedCatalog.printMethods.map((m) => {
      const s = fabricSurface({ fabricId: "cotton", kind: "cotton", color: "#151515", size: SIZE, mmPerPx: 16 / SIZE });
      applyPrint(s, squareArt(), m.id);
      return { id: m.id, px: shade(s) };
    });
    for (const { px } of pictures) {
      const middle = ((SIZE / 2) * SIZE + SIZE / 2) * 4;
      // Gold shows in the middle of the print (red channel well above a black garment's).
      expect(px[middle]!).toBeGreaterThan(plain[middle]! + 40);
    }
    const flat = pictures.find((p) => p.id === "vinyl")!.px;
    for (const id of ["dtg", "puff", "embroidery", "embroidery3d", "vinylSpecial", "chenillePatch"]) {
      expect(difference(flat, pictures.find((p) => p.id === id)!.px)).toBeGreaterThan(1);
    }
  });
});
