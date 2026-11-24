import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import type { Sleeve } from "@/lib/catalog/types";
import { tierBoxCm } from "@/lib/design/geometry";
import { garmentPhoto, hasPhotos, labelOnPhoto, photoUrl, photoViewFor, placeOnPhoto, quadCenter, quadCorners, type Pt } from "./photos";

const inside = (poly: Pt[], [x, y]: Pt) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

describe("garment photos", () => {
  it("has a front and a back photo for every garment and sleeve on sale", () => {
    for (const product of seedCatalog.products) {
      for (const sleeve of Object.keys(product.basePrice) as Sleeve[]) {
        expect(hasPhotos(product.mockup, sleeve), `${product.id} ${sleeve}`).toBe(true);
      }
    }
  });

  it("serves the big photo for the designer and a small one for little pictures", () => {
    const photo = garmentPhoto("tshirt", "short", "front")!;
    expect(photoUrl(photo, false)).toBe("/mockups/tshirt-short-front.webp");
    expect(photoUrl(photo, true)).toBe("/mockups/720/tshirt-short-front.webp");
    expect(photoViewFor("left")).toBe("front");
    expect(photoViewFor("back")).toBe("back");
  });

  it("puts the wearer's left chest on the viewer's right of the front photo", () => {
    const photo = garmentPhoto("tshirt", "short", "front")!;
    const left = placeOnPhoto(photo, "leftChest", 10, 10)!;
    const right = placeOnPhoto(photo, "rightChest", 10, 10)!;
    expect(quadCenter(left)[0]).toBeGreaterThan(photo.neck[0]);
    expect(quadCenter(right)[0]).toBeLessThan(photo.neck[0]);
    // 6 cm below the neckline, 10 cm wide.
    expect(left.origin[1]).toBeCloseTo(photo.neck[1] + 6 * photo.px, 5);
    expect(left.ax[0] * left.wMm).toBeCloseTo(10 * photo.px, 5);
  });

  it("only shows each print on the side it's on", () => {
    const front = garmentPhoto("hoodie", "long", "front")!;
    const back = garmentPhoto("hoodie", "long", "back")!;
    expect(placeOnPhoto(front, "fullBack", 30, 42)).toBeNull();
    expect(placeOnPhoto(back, "frontCenter", 21, 30)).toBeNull();
    expect(placeOnPhoto(back, "hood", 10, 10)).not.toBeNull();
    expect(placeOnPhoto(front, "hood", 10, 10)).toBeNull();
    // Sleeve prints show on the front photo.
    expect(placeOnPhoto(front, "leftSleeve", 8, 30)).not.toBeNull();
    expect(placeOnPhoto(back, "leftSleeve", 8, 30)).toBeNull();
    expect(placeOnPhoto(garmentPhoto("tshirt", "short", "back")!, "hood", 10, 10)).toBeNull();
  });

  it("lays sleeve prints along the right sleeve, inside its outline", () => {
    for (const [mockup, sleeve] of [["tshirt", "short"], ["tshirt", "long"], ["polo", "short"], ["hoodie", "long"], ["varsity", "long"]] as const) {
      const photo = garmentPhoto(mockup, sleeve, "front")!;
      for (const [areaId, side] of [["leftSleeve", "left"], ["rightSleeve", "right"]] as const) {
        const area = seedCatalog.printAreas.find((a) => a.id === areaId)!;
        const [w, h] = tierBoxCm(area, sleeve === "short" ? "S" : "M");
        const quad = placeOnPhoto(photo, areaId, w, h)!;
        const outline = photo.sleeves![side];
        expect(inside([outline.p0, outline.pin, outline.p2, outline.p1], quadCenter(quad)), `${mockup} ${sleeve} ${areaId}`).toBe(true);
        // The wearer's left sleeve is on the viewer's right.
        expect(quadCenter(quad)[0] > photo.neck[0]).toBe(side === "left");
        expect(quad.clip).toHaveLength(4);
      }
    }
  });

  it("keeps every print area of every garment on the garment", () => {
    for (const product of seedCatalog.products) {
      for (const sleeve of Object.keys(product.basePrice) as Sleeve[]) {
        for (const view of ["front", "back"] as const) {
          const photo = garmentPhoto(product.mockup, sleeve, view)!;
          const [x0, y0, x1, y1] = photo.box;
          const slack = photo.size * 0.02;
          for (const areaId of product.printAreaIds) {
            const area = seedCatalog.printAreas.find((a) => a.id === areaId)!;
            const tier = sleeve === "short" && area.maxTierShortSleeve ? area.maxTierShortSleeve : area.maxTier;
            const [w, h] = tierBoxCm(area, tier);
            const quad = placeOnPhoto(photo, areaId, w, h);
            if (!quad) continue;
            for (const [x, y] of quadCorners(quad)) {
              const where = `${product.id} ${sleeve} ${view} ${areaId}`;
              expect(x, where).toBeGreaterThan(x0 - slack);
              expect(x, where).toBeLessThan(x1 + slack);
              expect(y, where).toBeGreaterThan(y0 - slack);
              expect(y, where).toBeLessThan(y1 + slack);
            }
          }
        }
      }
    }
  });

  it("shows the neck label through the neck opening on front photos only", () => {
    const front = garmentPhoto("sweatshirt", "long", "front")!;
    const label = labelOnPhoto(front)!;
    expect(quadCenter(label)[1]).toBeLessThan(front.neck[1]);
    expect(labelOnPhoto(garmentPhoto("sweatshirt", "long", "back")!)).toBeNull();
  });
});
