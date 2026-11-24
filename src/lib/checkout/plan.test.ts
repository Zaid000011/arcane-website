import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { defaultDesign } from "@/lib/design/logic";
import { shippingFor } from "@/lib/pricing/engine";
import { allowedMethods, paymentPlan, priceItem, shippingSelection } from "./plan";

const policy = seedCatalog.payments;

describe("shipping", () => {
  it("charges by governorate zone and nothing for pickup", () => {
    expect(shippingFor(seedCatalog, { method: "pickup" }).fee).toBe(0);
    expect(shippingFor(seedCatalog, { method: "delivery", governorateId: "giza" }).fee).toBe(70);
    expect(shippingFor(seedCatalog, { method: "school", governorateId: "minya" }).fee).toBe(110);
    expect(shippingFor(seedCatalog, { method: "delivery", governorateId: "atlantis" })).toEqual({ fee: null, issue: "unknownGovernorate" });
    expect(shippingFor({ ...seedCatalog, pickup: { enabled: false, fee: 0 } }, { method: "pickup" }).issue).toBe("pickupUnavailable");
  });

  it("has no shipping choice until a governorate is picked", () => {
    expect(shippingSelection({ method: "delivery", governorateId: "" })).toBeUndefined();
    expect(shippingSelection({ method: "school", governorateId: "cairo" })).toEqual({ method: "school", governorateId: "cairo" });
    expect(shippingSelection({ method: "pickup", governorateId: "cairo" })).toEqual({ method: "pickup" });
  });
});

describe("payment plan", () => {
  it("takes half now and half on delivery by default", () => {
    expect(allowedMethods(policy, 1701)).toEqual(["transfer"]);
    expect(paymentPlan(policy, 1701, "transfer")).toEqual({ method: "transfer", upfront: 851, onDelivery: 850 });
    expect(paymentPlan(policy, 1701, "cod")).toBeNull();
  });

  it("allows cash on delivery for small orders when the owner turns it on", () => {
    const p = { depositPercent: 50, codFullMaxTotal: 2000 };
    expect(allowedMethods(p, 2000)).toEqual(["transfer", "cod"]);
    expect(paymentPlan(p, 2000, "cod")).toEqual({ method: "cod", upfront: 0, onDelivery: 2000 });
    expect(allowedMethods(p, 2001)).toEqual(["transfer"]);
  });

  it("handles full payment up front and no deposit at all", () => {
    expect(paymentPlan({ depositPercent: 100, codFullMaxTotal: 0 }, 900, "transfer")).toEqual({ method: "transfer", upfront: 900, onDelivery: 0 });
    expect(allowedMethods({ depositPercent: 0, codFullMaxTotal: 0 }, 900)).toEqual(["cod"]);
  });
});

describe("pricing a cart item", () => {
  it("blocks an item with no pieces and passes one with sizes", () => {
    const design = defaultDesign(seedCatalog, "hoodie");
    expect(priceItem(seedCatalog, design, { sizes: {}, roster: [], deliverySpeedId: "standard" }).blocking).toBe(true);
    const ok = priceItem(seedCatalog, design, { sizes: { M: 2 }, roster: [], deliverySpeedId: "standard" });
    expect(ok.blocking).toBe(false);
    expect(ok.quote.total).toBe(1700);
  });
});
