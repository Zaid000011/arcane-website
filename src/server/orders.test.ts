import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { addElement, newImageElement } from "@/lib/design/elements";
import { defaultDesign, togglePrint } from "@/lib/design/logic";
import { togglePersonal } from "@/lib/design/personalization";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation";
import { saveAsset } from "./assets";
import { useMemoryDb } from "./db";
import { priceSheetOf } from "@/lib/catalog/price-sheet";
import { savePriceSheet } from "./catalog-store";
import {
  addNote,
  addReceipt,
  confirmPayment,
  createOrder,
  getAdminOrder,
  getOrder,
  listOrders,
  OrderError,
  readFileFor,
  readFileForTeam,
  resetCustomerLink,
  respondToProof,
  sendProof,
  setOrderStatus,
} from "./orders";

process.env.ARCANE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "arcane-orders-"));

const NOW = new Date(Date.UTC(2026, 10, 23, 10, 0));
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const KEY = "k".repeat(43);
const hoodie = seedCatalog.products.find((p) => p.id === "hoodie")!;

let requestCount = 0;
function input(over: Record<string, unknown> = {}): CheckoutInput {
  requestCount++;
  return checkoutSchema.parse({
    requestId: `00000000-0000-4000-8000-${String(requestCount).padStart(12, "0")}`,
    key: KEY,
    locale: "en",
    customer: { name: "Mariam Hassan", phone: "010 1234 5678", email: "" },
    shipping: { method: "delivery", governorateId: "cairo", city: "Nasr City", address: "12 Abbas El Akkad St, flat 4" },
    paymentMethod: "transfer",
    items: [{ design: defaultDesign(seedCatalog, "hoodie"), order: { sizes: { M: 2 }, roster: [], deliverySpeedId: "standard" } }],
    ...over,
  });
}

const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof OrderError ? e.code : String(e);
  }
  return "no error";
};

beforeEach(() => {
  useMemoryDb();
});

describe("placing an order", () => {
  it("prices everything on the server and asks for half up front", () => {
    const { code } = createOrder(input(), NOW);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const order = getOrder(code, KEY);
    // 2 hoodies × 850 + Cairo shipping 70.
    expect(order.totals).toEqual({ items: 1700, shipping: 70, total: 1770 });
    expect(order.payment).toEqual({ method: "transfer", upfront: 885, onDelivery: 885, paid: 0 });
    expect(order.status).toBe("placed");
    expect(order.paymentStatus).toBe("unpaid");
    expect(order.customer.phone).toBe("01012345678");
    expect(order.events.map((e) => e.type)).toEqual(["placed"]);
    expect(order.workingDays).toBe(14);
  });

  it("charges nothing for pickup and keeps per-person lists", () => {
    let design = defaultDesign(seedCatalog, "hoodie");
    design = togglePersonal(hoodie, design, "name", true, "#F5EBD8");
    const roster = [
      { id: "r1", name: "  Omar   Adel ", number: "", sizeId: "L" },
      { id: "r2", name: "Salma", number: "", sizeId: "S" },
    ];
    const { code } = createOrder(input({ shipping: { method: "pickup" }, items: [{ design, order: { sizes: { M: 40 }, roster, deliverySpeedId: "express" } }] }), NOW);
    const order = getOrder(code, KEY);
    expect(order.totals.shipping).toBe(0);
    expect(order.items[0]!.order.sizes).toEqual({});
    expect(order.items[0]!.order.roster.map((r) => r.name)).toEqual(["Omar Adel", "Salma"]);
    expect(order.items[0]!.quote.quantity).toBe(2);
    // Express adds 20% (at least 300) on top of 2 × (850 + 35 for the name).
    expect(order.totals.items).toBe(1770 + 354);
  });

  it("returns the same order when the same request is sent twice", () => {
    const first = input();
    const again = { ...first };
    expect(createOrder(first, NOW).code).toBe(createOrder(again, NOW).code);
    expect(fails(() => createOrder({ ...first, key: "x".repeat(43) }, NOW))).toBe("conflict");
  });

  it("rejects bad details", () => {
    expect(fails(() => createOrder(input({ customer: { name: "Mariam", phone: "12345" } }), NOW))).toBe("invalid");
    expect(fails(() => createOrder(input({ shipping: { method: "delivery", governorateId: "atlantis", city: "X city", address: "Somewhere 1" } }), NOW))).toBe("invalid");
    expect(fails(() => createOrder(input({ shipping: { method: "delivery", governorateId: "cairo", city: "Nasr City", address: "" } }), NOW))).toBe("invalid");
    expect(fails(() => createOrder(input({ shipping: { method: "school", governorateId: "giza", school: "" } }), NOW))).toBe("invalid");
    const design = defaultDesign(seedCatalog, "hoodie");
    expect(fails(() => createOrder(input({ items: [{ design, order: { sizes: { XXXXL: 3 }, roster: [], deliverySpeedId: "standard" } }] }), NOW))).toBe("invalid");
  });

  it("rejects items that can't be made and payment methods that aren't offered", () => {
    const design = defaultDesign(seedCatalog, "hoodie");
    expect(fails(() => createOrder(input({ items: [{ design, order: { sizes: {}, roster: [], deliverySpeedId: "standard" } }] }), NOW))).toBe("designProblem");
    expect(fails(() => createOrder(input({ paymentMethod: "cod" }), NOW))).toBe("paymentMethod");
  });

  it("needs uploaded artwork to be on the server", () => {
    let design = togglePrint(seedCatalog, defaultDesign(seedCatalog, "hoodie"), "frontCenter");
    const img = newImageElement({ w: 210, h: 300 }, { assetId: "order-asset-0001", name: "logo.png", pxW: 3000, pxH: 3000, vector: false });
    design = addElement(seedCatalog, design, "frontCenter", img);
    const order = { sizes: { M: 2 }, roster: [], deliverySpeedId: "standard" };
    expect(fails(() => createOrder(input({ items: [{ design, order }] }), NOW))).toBe("missingAssets");
    saveAsset("order-asset-0001", PNG);
    expect(createOrder(input({ items: [{ design, order }] }), NOW).code).toMatch(/^[A-Z2-9]{6}$/);
  });
});

describe("the team's order list", () => {
  it("sorts orders into what needs doing and searches by code, name or phone", () => {
    const a = createOrder(input(), NOW).code;
    const b = createOrder(input({ customer: { name: "Omar Adel", phone: "0122 333 4444" } }), new Date(NOW.getTime() + 60_000)).code;
    const c = createOrder(input({ customer: { name: "Salma", phone: "01555666777" } }), new Date(NOW.getTime() + 120_000)).code;
    addReceipt(a, KEY, PNG, NOW); // a screenshot to check
    confirmPayment(b, 885, NOW); // deposit in: a proof to make
    setOrderStatus(c, "cancelled", NOW);

    const open = listOrders();
    expect(open.rows.map((r) => r.code)).toEqual([b, a]);
    expect(open.counts).toEqual({ payment: 1, proof: 1, production: 0, open: 2 });
    expect(open.rows.find((r) => r.code === a)).toMatchObject({ attention: "payment", pieces: 2, total: 1770, delivery: "delivery" });

    expect(listOrders({ view: "action" }).rows.map((r) => r.attention)).toEqual(["proof", "payment"]);
    expect(listOrders({ view: "cancelled" }).rows.map((r) => r.code)).toEqual([c]);
    expect(listOrders({ view: "all", q: "omar" }).rows.map((r) => r.code)).toEqual([b]);
    expect(listOrders({ view: "all", q: "٠١٢٢٣٣٣" }).rows.map((r) => r.code)).toEqual([b]);
    expect(listOrders({ view: "all", q: c.toLowerCase() }).rows.map((r) => r.code)).toEqual([c]);
  });

  it("prices new orders with the owner's saved prices", () => {
    const sheet = priceSheetOf(seedCatalog);
    sheet.products.find((p) => p.id === "hoodie")!.basePrice.long = 1000;
    savePriceSheet(sheet, "Mariam", NOW);
    const { code } = createOrder(input(), NOW);
    expect(getOrder(code, KEY).totals).toEqual({ items: 2000, shipping: 70, total: 2070 });
  });
});

describe("the private order page", () => {
  it("needs the order key", () => {
    const { code } = createOrder(input(), NOW);
    expect(fails(() => getOrder(code, "wrong"))).toBe("unauthorized");
    expect(fails(() => getOrder(code, null))).toBe("unauthorized");
    expect(fails(() => getOrder("NOPE22", KEY))).toBe("notFound");
    expect(getOrder(code.toLowerCase(), KEY).code).toBe(code);
  });

  it("takes payment screenshots", () => {
    const { code } = createOrder(input(), NOW);
    const order = addReceipt(code, KEY, PNG, NOW);
    expect(order.paymentStatus).toBe("receiptSubmitted");
    expect(order.files).toHaveLength(1);
    expect(order.events.map((e) => e.type)).toEqual(["placed", "receiptUploaded"]);
    expect(readFileFor(code, KEY, order.files[0]!.id).type).toBe("image/png");
    expect(fails(() => readFileFor(code, "wrong", order.files[0]!.id))).toBe("unauthorized");
    expect(fails(() => addReceipt(code, KEY, Buffer.from("<svg></svg>"), NOW))).toBe("badType");
    expect(fails(() => addReceipt(code, "wrong", PNG, NOW))).toBe("unauthorized");
  });
});

describe("the team's steps", () => {
  it("goes from deposit to proof, changes, approval and delivery", () => {
    const { code } = createOrder(input(), NOW);
    confirmPayment(code, 885, NOW);
    let order = getOrder(code, KEY);
    expect(order.paymentStatus).toBe("depositPaid");
    expect(order.status).toBe("designReview");

    sendProof(code, [PNG], "First draft", NOW);
    expect(getOrder(code, KEY).status).toBe("proofSent");
    expect(fails(() => respondToProof(code, KEY, { approve: false, comment: "" }, NOW))).toBe("invalid");
    order = respondToProof(code, KEY, { approve: false, comment: "Make the logo bigger" }, NOW);
    expect(order.status).toBe("designReview");
    expect(order.events.at(-1)).toMatchObject({ type: "changesRequested", note: "Make the logo bigger" });

    sendProof(code, [PNG], "", NOW);
    order = respondToProof(code, KEY, { approve: true, comment: "" }, NOW);
    expect(order.status).toBe("proofApproved");
    expect(fails(() => respondToProof(code, KEY, { approve: true, comment: "" }, NOW))).toBe("wrongStatus");

    setOrderStatus(code, "inProduction", NOW);
    expect(fails(() => setOrderStatus(code, "delivered", NOW))).toBe("wrongStatus");
    setOrderStatus(code, "qualityCheck", NOW);
    expect(fails(() => setOrderStatus(code, "readyForPickup", NOW))).toBe("wrongStatus");
    setOrderStatus(code, "shipped", NOW);
    setOrderStatus(code, "delivered", NOW);
    confirmPayment(code, 885, NOW);
    order = getOrder(code, KEY);
    expect(order.status).toBe("delivered");
    expect(order.paymentStatus).toBe("paid");
    expect(order.payment.paid).toBe(1770);
  });

  it("records who did each step for the team, but not for the customer", () => {
    const { code } = createOrder(input(), NOW);
    confirmPayment(code, 885, NOW, "Omar");
    const team = getAdminOrder(code);
    expect(team.order.events.at(-1)).toMatchObject({ type: "status", note: "designReview", actor: "Omar" });
    expect(team.attention).toBe("proof");
    expect(team.next).toEqual(["cancelled"]);
    expect(getOrder(code, KEY).events.some((e) => "actor" in e)).toBe(false);
    addNote(code, "  Customer prefers delivery after 5pm ", "Omar", NOW);
    expect(getAdminOrder(code).notes).toEqual([{ author: "Omar", text: "Customer prefers delivery after 5pm", createdAt: NOW.toISOString() }]);
    expect(fails(() => addNote(code, "   ", "Omar", NOW))).toBe("invalid");
  });

  it("makes a new customer link when the old one is lost", () => {
    const { code } = createOrder(input(), NOW);
    const { key } = resetCustomerLink(code, "Mariam", NOW);
    expect(fails(() => getOrder(code, KEY))).toBe("unauthorized");
    expect(getOrder(code, key).code).toBe(code);
    expect(getAdminOrder(code).notes[0]!.text).toMatch(/new customer link/);
  });

  it("lets the team see screenshots and proofs without the customer key", () => {
    const { code } = createOrder(input(), NOW);
    const order = addReceipt(code, KEY, PNG, NOW);
    expect(readFileForTeam(code, order.files[0]!.id).type).toBe("image/png");
    expect(fails(() => readFileForTeam(code, "00000000-0000-4000-8000-000000000000"))).toBe("notFound");
  });

  it("won't start production before the deposit is paid", () => {
    const { code } = createOrder(input(), NOW);
    sendProof(code, [PNG], "", NOW);
    respondToProof(code, KEY, { approve: true, comment: "" }, NOW);
    expect(fails(() => setOrderStatus(code, "inProduction", NOW))).toBe("wrongStatus");
    confirmPayment(code, 885, NOW);
    setOrderStatus(code, "inProduction", NOW);
    expect(getOrder(code, KEY).status).toBe("inProduction");
  });
});
