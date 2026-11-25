import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import type { Catalog } from "@/lib/catalog/types";
import { hasBlockingIssues, quote } from "./engine";
import type { DesignSelection, OrderSelection, PrintSelection } from "./types";

const noPersonalization = { names: false, numbers: false, namesList: false, neckLabel: false };

let printCount = 0;
/** A print on a side whose artwork measures w × h cm (one image, so its size is exact). */
const pr = (side: string, methodId: string, wCm: number, hCm: number, over: Partial<PrintSelection> = {}): PrintSelection => ({
  id: `p${++printCount}`,
  areaId: side,
  methodId,
  tier: "S",
  elements: [{ id: `e${printCount}`, type: "image", assetId: "asset-0001", name: "art.png", w: wCm * 10, aspect: hCm / wCm, pxW: 4000, pxH: 4000, vector: true, x: 200, y: 250, rotation: 0 }],
  ...over,
});

const hoodie = (over: Partial<DesignSelection> = {}): DesignSelection => ({
  productId: "hoodie",
  sleeve: "long",
  fitId: "regular",
  gsm: 280,
  fabricId: "cottonFleece",
  bodyColorId: "black",
  partColors: {},
  prints: [],
  personalization: noPersonalization,
  ...over,
});

const tee = (over: Partial<DesignSelection> = {}): DesignSelection => ({
  productId: "tshirt",
  sleeve: "short",
  fitId: "regular",
  gsm: 160,
  fabricId: "cotton",
  bodyColorId: "black",
  partColors: {},
  prints: [],
  personalization: noPersonalization,
  ...over,
});

const order = (sizes: Record<string, number>, over: Partial<OrderSelection> = {}): OrderSelection => ({
  sizes,
  deliverySpeedId: "standard",
  ...over,
});

const codes = (q: ReturnType<typeof quote>) => q.issues.map((i) => i.code);

describe("base garments", () => {
  it("prices a single plain t-shirt at the base price", () => {
    const q = quote(seedCatalog, tee(), order({ M: 1 }));
    expect(q.unitPrice).toBe(650);
    expect(q.quantity).toBe(1);
    expect(q.itemsTotal).toBe(650);
    expect(q.total).toBe(650);
    expect(q.shipping.fee).toBeNull();
    expect(q.issues).toEqual([]);
  });

  it("applies the long-sleeve t-shirt price", () => {
    expect(quote(seedCatalog, tee({ sleeve: "long" }), order({ M: 1 })).unitPrice).toBe(710);
  });

  it("subtracts for lighter GSM", () => {
    expect(quote(seedCatalog, tee({ gsm: 140 }), order({ M: 1 })).unitPrice).toBe(630);
  });

  it("rejects a sleeve the product doesn't offer", () => {
    const q = quote(seedCatalog, hoodie({ sleeve: "short" }), order({ M: 1 }));
    expect(codes(q)).toContain("invalidSleeve");
    expect(hasBlockingIssues(q)).toBe(true);
  });

  it("rejects an unknown product", () => {
    const q = quote(seedCatalog, hoodie({ productId: "cape" }), order({ M: 1 }));
    expect(codes(q)).toEqual(["unknownProduct"]);
    expect(q.total).toBe(0);
  });
});

describe("options and colors", () => {
  it("adds fit, GSM, contrast part, print and name fees per piece", () => {
    const design = hoodie({
      fitId: "oversized",
      gsm: 320,
      partColors: { hoodLining: "arcaneRed", drawstrings: "black" },
      prints: [pr("front", "dtf", 21, 30)],
      personalization: { ...noPersonalization, names: true },
    });
    const q = quote(seedCatalog, design, order({ M: 6, L: 4 }));
    // 850 + 40 oversized + 60 (320 GSM) + 40 hood lining + 80 DTF M + 35 name
    expect(q.unitPrice).toBe(1105);
    expect(q.quantity).toBe(10);
    expect(q.itemsTotal).toBe(11050);
    expect(q.total).toBe(11050);
    expect(q.issues).toEqual([]);
  });

  it("doesn't charge a contrast fee when the part matches the body color", () => {
    const q = quote(seedCatalog, hoodie({ partColors: { hoodLining: "black" } }), order({ M: 1 }));
    expect(q.unitPrice).toBe(850);
    expect(q.lines.some((l) => l.id === "part:hoodLining")).toBe(false);
  });

  it("flags out-of-stock colors", () => {
    const catalog: Catalog = structuredClone(seedCatalog);
    catalog.colors.find((c) => c.id === "navy")!.inStock = false;
    const q = quote(catalog, tee({ bodyColorId: "navy" }), order({ M: 1 }));
    expect(codes(q)).toContain("colorOutOfStock");
  });
});

describe("sizes", () => {
  it("charges every size the same, including 2XL and 3XL", () => {
    const q = quote(seedCatalog, tee(), order({ M: 1, "2XL": 2, "3XL": 1 }));
    expect(q.quantity).toBe(4);
    expect(q.itemsTotal).toBe(650 * 4);
    expect(q.lines.some((l) => l.id.startsWith("size:"))).toBe(false);
  });

  it("adds a size fee only to those pieces when the owner sets one", () => {
    const catalog: Catalog = structuredClone(seedCatalog);
    catalog.sizes.find((s) => s.id === "2XL")!.surcharge = 30;
    catalog.sizes.find((s) => s.id === "3XL")!.surcharge = 50;
    const q = quote(catalog, tee(), order({ M: 1, "2XL": 2, "3XL": 1 }));
    expect(q.itemsTotal).toBe(650 * 4 + 30 * 2 + 50);
  });

  it("ignores negative and fractional quantities safely", () => {
    const q = quote(seedCatalog, tee(), order({ M: -3, L: 2.7 }));
    expect(q.quantity).toBe(2);
  });

  it("returns a unit price but no totals while quantity is zero", () => {
    const q = quote(
      seedCatalog,
      tee({ prints: [pr("front", "embroidery", 10, 10)] }),
      order({}, { deliverySpeedId: "express" }),
    );
    expect(q.unitPrice).toBe(710);
    expect(q.setupTotal).toBe(300);
    expect(q.subtotal).toBe(0);
    expect(q.delivery.fee).toBe(0);
    expect(q.total).toBe(0);
  });
});

describe("prints", () => {
  it("prices screen printing per color and charges setup per color once", () => {
    const design = tee({ prints: [pr("back", "screen", 30, 40, { colorCount: 2 })] });
    const q = quote(seedCatalog, design, order({ M: 30 }));
    expect(q.unitPrice).toBe(650 + 40 * 2);
    expect(q.itemsTotal).toBe(730 * 30);
    expect(q.setupTotal).toBe(600);
    expect(q.subtotal).toBe(21900 + 600);
    expect(q.issues).toEqual([]);
  });

  it("blocks screen printing under the minimum quantity", () => {
    const design = tee({ prints: [pr("back", "screen", 30, 40, { colorCount: 1 })] });
    const q = quote(seedCatalog, design, order({ M: 20 }));
    expect(q.issues).toContainEqual({ code: "minQuantity", severity: "error", params: { methodId: "screen", minQty: 24 } });
  });

  it("only warns about minimum quantity before sizes are entered", () => {
    const design = tee({ prints: [pr("back", "screen", 30, 40, { colorCount: 1 })] });
    const q = quote(seedCatalog, design, order({}));
    expect(q.issues).toEqual([{ code: "minQuantity", severity: "warning", params: { methodId: "screen", minQty: 24 } }]);
  });

  it("doesn't warn about minimums for methods without one", () => {
    const q = quote(seedCatalog, tee({ prints: [pr("front", "dtf", 21, 30)] }), order({}));
    expect(q.issues).toEqual([]);
  });

  it("rejects more screen colors than allowed", () => {
    const design = tee({ prints: [pr("back", "screen", 30, 40, { colorCount: 9 })] });
    expect(codes(quote(seedCatalog, design, order({ M: 30 })))).toContain("tooManyColors");
  });

  it("charges embroidery digitizing once no matter the quantity", () => {
    const design = tee({ prints: [pr("front", "embroidery", 10, 10)] });
    expect(quote(seedCatalog, design, order({ M: 1 })).subtotal).toBe(710 + 300);
    expect(quote(seedCatalog, design, order({ M: 50 })).subtotal).toBe(710 * 50 + 300);
  });

  it("prices each print by the size of its artwork", () => {
    const price = (w: number, h: number) => quote(seedCatalog, tee({ prints: [pr("front", "dtf", w, h)] }), order({ M: 1 })).unitPrice - 650;
    expect(price(9, 9)).toBe(40);
    expect(price(20, 28)).toBe(80);
    // Landscape A4 is still A4.
    expect(price(29, 20)).toBe(80);
    expect(price(30, 40)).toBe(130);
  });

  it("works the size out from the artwork, not from the size the browser sent", () => {
    const q = quote(seedCatalog, tee({ prints: [pr("back", "dtf", 30, 40, { tier: "S" })] }), order({ M: 1 }));
    expect(q.unitPrice).toBe(650 + 130);
  });

  it("rejects a print bigger than its print type allows", () => {
    const q = quote(seedCatalog, tee({ prints: [pr("front", "wovenPatch", 20, 20)] }), order({ M: 1 }));
    expect(codes(q)).toContain("printTooBig");
    expect(q.issues.find((i) => i.code === "printTooBig")?.params).toMatchObject({ methodId: "wovenPatch", maxTier: "S", tier: "M" });
    expect(q.unitPrice).toBe(650);
  });

  it("prices a sleeve print by its size", () => {
    const long = quote(seedCatalog, tee({ sleeve: "long", prints: [pr("leftSleeve", "dtf", 8, 30)] }), order({ M: 1 }));
    expect(long.issues).toEqual([]);
    expect(long.unitPrice).toBe(710 + 80);
  });

  it("rejects DTG on polyester", () => {
    const q = quote(seedCatalog, tee({ fabricId: "polyester", prints: [pr("front", "dtg", 21, 30)] }), order({ M: 1 }));
    expect(codes(q)).toContain("methodFabricMismatch");
  });

  it("requires light polyester for sublimation, and prices bigger than A3 as all-over", () => {
    const sublimation = pr("front", "sublimation", 38, 50);
    const dark = quote(seedCatalog, tee({ fabricId: "polyester", prints: [sublimation] }), order({ M: 1 }));
    expect(codes(dark)).toContain("methodNeedsLightGarment");

    const light = quote(seedCatalog, tee({ fabricId: "polyester", bodyColorId: "white", prints: [sublimation] }), order({ M: 1 }));
    expect(light.issues).toEqual([]);
    expect(light.unitPrice).toBe(650 + 250);
  });

  it("takes several prints on one side, each priced on its own", () => {
    const prints = [pr("front", "dtf", 21, 30), pr("front", "puff", 10, 10), pr("front", "embroidery", 9, 9)];
    const q = quote(seedCatalog, tee({ prints }), order({ M: 10 }));
    expect(q.issues).toEqual([]);
    expect(q.unitPrice).toBe(650 + 80 + 70 + 60);
    expect(q.lines.filter((l) => l.kind === "print").map((l) => l.label.en)).toEqual(["Front · DTF · Medium", "Front 2 · Puff print · Small", "Front 3 · Embroidery · Small"]);
  });

  it("limits how many prints one side can hold", () => {
    const prints = Array.from({ length: 7 }, () => pr("back", "dtf", 5, 5));
    expect(codes(quote(seedCatalog, tee({ prints }), order({ M: 10 })))).toContain("duplicateArea");
  });

  it("rejects sides the product doesn't have", () => {
    expect(codes(quote(seedCatalog, tee({ prints: [pr("hood", "dtf", 8, 8)] }), order({ M: 1 })))).toContain("invalidArea");
    expect(codes(quote(seedCatalog, tee({ prints: [pr("frontCenter", "dtf", 8, 8)] }), order({ M: 1 })))).toContain("invalidArea");
  });
});

describe("personalization", () => {
  it("adds the names list per piece plus a one-time layout fee", () => {
    const q = quote(seedCatalog, hoodie({ personalization: { ...noPersonalization, namesList: true, namesListCount: 120 } }), order({ M: 40 }));
    expect(q.unitPrice).toBe(900);
    expect(q.subtotal).toBe(900 * 40 + 300);
    expect(q.issues).toEqual([]);
  });

  it("rejects a names list over the limit", () => {
    const q = quote(seedCatalog, hoodie({ personalization: { ...noPersonalization, namesList: true, namesListCount: 250 } }), order({ M: 40 }));
    expect(codes(q)).toContain("namesListTooLong");
  });

  it("adds neck label per piece and setup", () => {
    const q = quote(seedCatalog, tee({ personalization: { ...noPersonalization, neckLabel: true, numbers: true } }), order({ M: 10 }));
    expect(q.unitPrice).toBe(650 + 25 + 35);
    expect(q.subtotal).toBe(710 * 10 + 400);
  });
});

describe("delivery speed", () => {
  it("uses the minimum express fee on small orders", () => {
    const q = quote(seedCatalog, tee(), order({ M: 1 }, { deliverySpeedId: "express" }));
    expect(q.delivery.fee).toBe(300);
    expect(q.delivery.workingDays).toBe(7);
    expect(q.total).toBe(950);
  });

  it("uses the percentage on larger orders", () => {
    const q = quote(seedCatalog, hoodie(), order({ M: 10 }, { deliverySpeedId: "rush" }));
    expect(q.delivery.fee).toBe(2975);
    expect(q.total).toBe(8500 + 2975);
  });

  it("rounds percentage fees to whole pounds", () => {
    const q = quote(seedCatalog, tee(), order({ M: 3 }, { deliverySpeedId: "rush" }));
    // 35% of 1950 = 682.5
    expect(q.delivery.fee).toBe(683);
    expect(q.total).toBe(1950 + 683);
  });

  it("adds extra production days for slower print methods", () => {
    const q = quote(seedCatalog, tee({ prints: [pr("front", "embroidery", 10, 10)] }), order({ M: 5 }, { deliverySpeedId: "rush" }));
    expect(q.delivery.workingDays).toBe(4 + 2);
  });

  it("rejects an unknown delivery speed", () => {
    expect(codes(quote(seedCatalog, tee(), order({ M: 1 }, { deliverySpeedId: "teleport" })))).toContain("invalidDeliverySpeed");
  });
});

describe("shipping", () => {
  it("charges by governorate zone", () => {
    expect(quote(seedCatalog, tee(), order({ M: 1 }, { shipping: { method: "delivery", governorateId: "cairo" } })).shipping.fee).toBe(70);
    expect(quote(seedCatalog, tee(), order({ M: 1 }, { shipping: { method: "delivery", governorateId: "aswan" } })).shipping.fee).toBe(110);
    expect(quote(seedCatalog, tee(), order({ M: 1 }, { shipping: { method: "school", governorateId: "alexandria" } })).shipping.fee).toBe(80);
  });

  it("makes pickup free", () => {
    const q = quote(seedCatalog, tee(), order({ M: 1 }, { shipping: { method: "pickup" } }));
    expect(q.shipping.fee).toBe(0);
    expect(q.total).toBe(650);
  });

  it("rejects an unknown governorate", () => {
    const q = quote(seedCatalog, tee(), order({ M: 1 }, { shipping: { method: "delivery", governorateId: "atlantis" } }));
    expect(codes(q)).toContain("unknownGovernorate");
    expect(q.shipping.fee).toBeNull();
  });
});

describe("promo codes", () => {
  it("applies a percent discount to the subtotal", () => {
    const q = quote(seedCatalog, tee(), order({ M: 10 }, { promo: { code: "CLUB10", type: "percent", value: 10 } }));
    expect(q.discount).toBe(650);
    expect(q.total).toBe(5850);
  });

  it("caps a fixed discount at the subtotal", () => {
    expect(quote(seedCatalog, tee(), order({ M: 1 }, { promo: { code: "X", type: "fixed", value: 100 } })).total).toBe(550);
    expect(quote(seedCatalog, tee(), order({ M: 1 }, { promo: { code: "X", type: "fixed", value: 1000 } })).total).toBe(0);
  });

  it("calculates the delivery fee before the discount", () => {
    const q = quote(seedCatalog, tee(), order({ M: 1 }, { deliverySpeedId: "express", promo: { code: "X", type: "percent", value: 10 } }));
    expect(q.total).toBe(650 - 65 + 300);
  });
});

describe("big mixed order", () => {
  it("prices 500 hoodies with rush delivery and shipping exactly", () => {
    const design = hoodie({
      fitId: "oversized",
      gsm: 320,
      prints: [pr("back", "dtf", 30, 40), pr("front", "dtf", 10, 10)],
      personalization: { ...noPersonalization, names: true },
    });
    const q = quote(
      seedCatalog,
      design,
      order(
        { S: 100, M: 150, L: 150, XL: 60, "2XL": 30, "3XL": 10 },
        { deliverySpeedId: "rush", shipping: { method: "school", governorateId: "giza" } },
      ),
    );
    // 850 + 40 + 60 + 130 + 40 + 35
    expect(q.unitPrice).toBe(1155);
    expect(q.quantity).toBe(500);
    // Every size is the same price, so 2XL and 3XL add nothing.
    expect(q.itemsTotal).toBe(1155 * 500);
    expect(q.delivery.fee).toBe(Math.round(577500 * 0.35));
    expect(q.total).toBe(577500 + 202125 + 70);
    expect(q.issues).toEqual([]);
  });

  it("reports the VAT already included in the total", () => {
    const q = quote(seedCatalog, tee(), order({ M: 1 }));
    expect(q.vatIncluded).toBe(80);
  });
});
