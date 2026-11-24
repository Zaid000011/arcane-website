import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import type { Catalog } from "@/lib/catalog/types";
import { hasBlockingIssues, quote } from "./engine";
import type { DesignSelection, OrderSelection } from "./types";

const noPersonalization = { names: false, numbers: false, namesList: false, neckLabel: false };

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
      prints: [{ areaId: "frontCenter", methodId: "dtf", tier: "M" }],
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
      tee({ prints: [{ areaId: "leftChest", methodId: "embroidery", tier: "S" }] }),
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
    const design = tee({ prints: [{ areaId: "fullBack", methodId: "screen", tier: "L", colorCount: 2 }] });
    const q = quote(seedCatalog, design, order({ M: 30 }));
    expect(q.unitPrice).toBe(650 + 40 * 2);
    expect(q.itemsTotal).toBe(730 * 30);
    expect(q.setupTotal).toBe(600);
    expect(q.subtotal).toBe(21900 + 600);
    expect(q.issues).toEqual([]);
  });

  it("blocks screen printing under the minimum quantity", () => {
    const design = tee({ prints: [{ areaId: "fullBack", methodId: "screen", tier: "L", colorCount: 1 }] });
    const q = quote(seedCatalog, design, order({ M: 20 }));
    expect(q.issues).toContainEqual({ code: "minQuantity", severity: "error", params: { methodId: "screen", minQty: 24 } });
  });

  it("only warns about minimum quantity before sizes are entered", () => {
    const design = tee({ prints: [{ areaId: "fullBack", methodId: "screen", tier: "L", colorCount: 1 }] });
    const q = quote(seedCatalog, design, order({}));
    expect(q.issues).toEqual([{ code: "minQuantity", severity: "warning", params: { methodId: "screen", minQty: 24 } }]);
  });

  it("doesn't warn about minimums for methods without one", () => {
    const q = quote(seedCatalog, tee({ prints: [{ areaId: "frontCenter", methodId: "dtf", tier: "M" }] }), order({}));
    expect(q.issues).toEqual([]);
  });

  it("rejects more screen colors than allowed", () => {
    const design = tee({ prints: [{ areaId: "fullBack", methodId: "screen", tier: "L", colorCount: 9 }] });
    expect(codes(quote(seedCatalog, design, order({ M: 30 })))).toContain("tooManyColors");
  });

  it("charges embroidery digitizing once no matter the quantity", () => {
    const design = tee({ prints: [{ areaId: "leftChest", methodId: "embroidery", tier: "S" }] });
    expect(quote(seedCatalog, design, order({ M: 1 })).subtotal).toBe(710 + 300);
    expect(quote(seedCatalog, design, order({ M: 50 })).subtotal).toBe(710 * 50 + 300);
  });

  it("rejects a print larger than the area allows", () => {
    const q = quote(seedCatalog, tee({ prints: [{ areaId: "leftChest", methodId: "dtf", tier: "L" }] }), order({ M: 1 }));
    expect(codes(q)).toContain("tierTooLarge");
    expect(q.unitPrice).toBe(650);
  });

  it("limits sleeve prints on short sleeves but allows them on long sleeves", () => {
    const print = { areaId: "leftSleeve", methodId: "dtf", tier: "M" as const };
    expect(codes(quote(seedCatalog, tee({ prints: [print] }), order({ M: 1 })))).toContain("tierTooLarge");
    const long = quote(seedCatalog, tee({ sleeve: "long", prints: [print] }), order({ M: 1 }));
    expect(long.issues).toEqual([]);
    expect(long.unitPrice).toBe(710 + 80);
  });

  it("rejects DTG on polyester", () => {
    const q = quote(seedCatalog, tee({ fabricId: "polyester", prints: [{ areaId: "frontCenter", methodId: "dtg", tier: "M" }] }), order({ M: 1 }));
    expect(codes(q)).toContain("methodFabricMismatch");
  });

  it("requires light polyester for sublimation", () => {
    const sublimation = { areaId: "fullFront", methodId: "sublimation", tier: "AO" as const };
    const dark = quote(seedCatalog, tee({ fabricId: "polyester", prints: [sublimation] }), order({ M: 1 }));
    expect(codes(dark)).toContain("methodNeedsLightGarment");

    const light = quote(seedCatalog, tee({ fabricId: "polyester", bodyColorId: "white", prints: [sublimation] }), order({ M: 1 }));
    expect(light.issues).toEqual([]);
    expect(light.unitPrice).toBe(650 + 250);
  });

  it("rejects two prints on the same area", () => {
    const prints = [
      { areaId: "frontCenter", methodId: "dtf", tier: "M" as const },
      { areaId: "frontCenter", methodId: "puff", tier: "M" as const },
    ];
    expect(codes(quote(seedCatalog, tee({ prints }), order({ M: 10 })))).toContain("duplicateArea");
  });

  it("rejects areas the product doesn't have", () => {
    expect(codes(quote(seedCatalog, tee({ prints: [{ areaId: "hood", methodId: "dtf", tier: "S" }] }), order({ M: 1 })))).toContain("invalidArea");
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
    const q = quote(seedCatalog, tee({ prints: [{ areaId: "leftChest", methodId: "embroidery", tier: "S" }] }), order({ M: 5 }, { deliverySpeedId: "rush" }));
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
      prints: [
        { areaId: "fullBack", methodId: "dtf", tier: "L" },
        { areaId: "leftChest", methodId: "dtf", tier: "S" },
      ],
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
