import { describe, expect, it } from "vitest";
import type { CartItem } from "@/lib/cart/store";
import { seedCatalog } from "@/lib/catalog/seed";
import { defaultDesign } from "@/lib/design/logic";
import { FULL_TRIMS } from "@/lib/design/options";
import { hasPhotos, photoTrimsFor } from "@/lib/mockup/photos";
import { emptyOrder } from "@/lib/order/types";
import { fitFiles } from "./email-inbox";
import { orderEmail, requestEmail } from "./whatsapp-order";

const item = (over: Partial<CartItem> = {}): CartItem =>
  ({
    id: "item-1",
    design: { ...defaultDesign(seedCatalog, "hoodie"), customColorHex: "#8A2BE2", noCuffs: true },
    order: { ...emptyOrder(), sizes: { M: 2, L: 1 } },
    addedAt: "2026-11-26T10:00:00.000Z",
    ...over,
  }) as CartItem;

describe("order emails", () => {
  it("say who ordered, what, how many and the total, in English, one detail per line", () => {
    const { subject, fields } = orderEmail(seedCatalog, [item()], "010 1234 5678", "ar");
    const get = (k: string) => fields.find(([name]) => name === k)?.[1];
    expect(subject).toMatch(/^New order: 3 pieces, EGP [\d,]+ \(01012345678\)$/);
    expect(get("Customer WhatsApp")).toBe("01012345678");
    expect(get("Customer's language")).toBe("Arabic");
    expect(get("Design 1")).toMatch(/^Hoodie · Long sleeve .* · No cuffs$/);
    expect(get("Design 1 color")).toBe("Your own color #8A2BE2 (we'll confirm it)");
    expect(get("Design 1 pieces")).toBe("3 pieces (M × 2 · L × 1)");
    expect(get("Total")).toMatch(/^EGP [\d,]+$/);
  });

  it("list the people when names and numbers are printed", () => {
    const d = defaultDesign(seedCatalog, "hoodie");
    const named = item({
      design: { ...d, personalization: { ...d.personalization, names: true, numbers: true } },
      order: { ...emptyOrder(), roster: [{ id: "r1", name: "Mariam", number: "7", sizeId: "M" }] },
    });
    const people = orderEmail(seedCatalog, [named], "01012345678", "en").fields.find(([k]) => k === "Design 1 people")?.[1];
    expect(people).toBe("Mariam · 7 · M");
  });

  it("describe a send-it-to-us request", () => {
    const { subject, fields } = requestEmail(seedCatalog, { kind: "design", name: "Omar", phone: "01112345678", productId: "tshirt", quantity: 40, message: "Front and back" }, "en");
    expect(subject).toBe("New request: their own design from Omar (01112345678)");
    expect(fields).toContainEqual(["Garment", "T-shirt"]);
    expect(fields).toContainEqual(["Message", "Front and back"]);
  });
});

describe("email attachments", () => {
  it("are kept in order until the 10 MB limit, and the rest are named so they can be asked for", () => {
    const mb = (n: number) => new Blob([new Uint8Array(n * 1024 * 1024)]);
    const { kept, skipped } = fitFiles([
      { name: "front.jpg", blob: mb(1) },
      { name: "huge.png", blob: mb(9) },
      { name: "back.jpg", blob: mb(1) },
    ]);
    expect(kept.map((f) => f.name)).toEqual(["front.jpg", "back.jpg"]);
    expect(skipped).toEqual(["huge.png"]);
  });
});

describe("photos while 3D is off", () => {
  it("show the standard photo for a garment without cuffs or waistband until its own photos exist", () => {
    const trims = { cuffs: false, waistband: false };
    expect(hasPhotos("hoodie", "long", trims)).toBe(false);
    expect(photoTrimsFor("hoodie", "long", trims)).toEqual(FULL_TRIMS);
    expect(photoTrimsFor("hoodie", "long", FULL_TRIMS)).toEqual(FULL_TRIMS);
  });
});
