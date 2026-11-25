import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { garmentPhoto, hasPhotos } from "@/lib/mockup/photos";
import { quote } from "@/lib/pricing/engine";
import { specFor } from "@/lib/three/shape";
import { designSchema } from "@/lib/validation";
import { en } from "@/i18n/dictionaries/en";
import { describeDesign } from "./describe";
import { defaultDesign, normalizeDesign, switchProduct } from "./logic";
import { bodyHex, canRemoveCuffs, canRemoveWaistband, trimsKey, trimsOf } from "./options";

const product = (id: string) => seedCatalog.products.find((p) => p.id === id)!;

describe("the customer's own color", () => {
  it("is drawn instead of the stocked color, and is kept on saved designs in capitals", () => {
    const d = normalizeDesign(seedCatalog, { ...defaultDesign(seedCatalog, "hoodie"), bodyColorId: "purple", customColorHex: "#8a2be2" });
    expect(d.customColorHex).toBe("#8A2BE2");
    expect(d.bodyColorId).toBe("purple");
    expect(bodyHex(seedCatalog, d)).toBe("#8A2BE2");
    expect(bodyHex(seedCatalog, { bodyColorId: "navy" })).toBe("#1C2541");
  });

  it("is dropped when it isn't a real color code", () => {
    const d = normalizeDesign(seedCatalog, { ...defaultDesign(seedCatalog, "hoodie"), customColorHex: "purple" });
    expect(d.customColorHex).toBeUndefined();
  });

  it("stays when switching garments, and doesn't change the price", () => {
    const own = { ...defaultDesign(seedCatalog, "hoodie"), customColorHex: "#8A2BE2" };
    expect(switchProduct(seedCatalog, own, "tshirt").customColorHex).toBe("#8A2BE2");
    const plain = quote(seedCatalog, defaultDesign(seedCatalog, "hoodie"), { sizes: { M: 2 }, deliverySpeedId: "standard" });
    const withOwn = quote(seedCatalog, own, { sizes: { M: 2 }, deliverySpeedId: "standard" });
    expect(withOwn.total).toBe(plain.total);
    expect(withOwn.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("is written in the order, so it's sent with it", () => {
    const own = { ...defaultDesign(seedCatalog, "hoodie"), customColorHex: "#8A2BE2" };
    expect(describeDesign(seedCatalog, own, "en", en.designer).colors[0]).toBe("Your own color #8A2BE2 (we'll confirm it)");
  });
});

describe("taking off cuffs and waistband", () => {
  it("is offered where the garment has them: cuffs on long sleeves, a waistband on fleece and jackets", () => {
    expect(canRemoveCuffs(product("hoodie"), "long")).toBe(true);
    expect(canRemoveWaistband(product("hoodie"))).toBe(true);
    expect(canRemoveCuffs(product("polo"), "long")).toBe(true);
    expect(canRemoveCuffs(product("polo"), "short")).toBe(false);
    expect(canRemoveWaistband(product("polo"))).toBe(false);
    expect(canRemoveCuffs(product("tshirt"), "long")).toBe(false);
    for (const id of ["zipHoodie", "sweatshirt", "varsity"]) {
      expect(canRemoveCuffs(product(id), "long"), id).toBe(true);
      expect(canRemoveWaistband(product(id)), id).toBe(true);
    }
  });

  it("is kept on saved designs only where it applies", () => {
    const hoodie = normalizeDesign(seedCatalog, { ...defaultDesign(seedCatalog, "hoodie"), noCuffs: true, noWaistband: true });
    expect([hoodie.noCuffs, hoodie.noWaistband]).toEqual([true, true]);
    const polo = normalizeDesign(seedCatalog, { ...defaultDesign(seedCatalog, "polo"), sleeve: "short", noCuffs: true, noWaistband: true });
    expect([polo.noCuffs, polo.noWaistband]).toEqual([undefined, undefined]);
    expect(trimsOf(product("tshirt"), { sleeve: "long", noCuffs: true, noWaistband: true })).toEqual({ cuffs: true, waistband: true });
  });

  it("changes the 3D garment and the photo looked for, not the price", () => {
    expect(specFor("hoodie", "regular", { cuffs: false, waistband: false })).toMatchObject({ cuff: 0, band: 0 });
    expect(specFor("hoodie", "regular").cuff).toBeGreaterThan(0);
    expect(trimsKey({ cuffs: false, waistband: true })).toBe("-nocuffs");
    expect(trimsKey({ cuffs: false, waistband: false })).toBe("-nocuffs-noband");
    // Until photos without them are made, the garment shows in 3D.
    expect(hasPhotos("hoodie", "long", { cuffs: false, waistband: true })).toBe(false);
    expect(garmentPhoto("hoodie", "long", "front", { cuffs: true, waistband: false })).toBeNull();
    expect(hasPhotos("hoodie", "long")).toBe(true);
    const d = { ...defaultDesign(seedCatalog, "hoodie"), noCuffs: true, noWaistband: true };
    const order = { sizes: { M: 1 }, deliverySpeedId: "standard" };
    expect(quote(seedCatalog, d, order).total).toBe(quote(seedCatalog, defaultDesign(seedCatalog, "hoodie"), order).total);
  });

  it("is written in the order", () => {
    const d = { ...defaultDesign(seedCatalog, "sweatshirt"), noCuffs: true, noWaistband: true };
    expect(describeDesign(seedCatalog, d, "en", en.designer).garment).toMatch(/No cuffs · No waistband$/);
  });

  it("passes the order checks, and bad values don't", () => {
    const d = { ...defaultDesign(seedCatalog, "hoodie"), customColorHex: "#8A2BE2", noCuffs: true, noWaistband: false };
    expect(designSchema.safeParse(d).success).toBe(true);
    expect(designSchema.safeParse({ ...d, customColorHex: "#12345" }).success).toBe(false);
    expect(designSchema.safeParse({ ...d, noCuffs: "yes" }).success).toBe(false);
  });
});
