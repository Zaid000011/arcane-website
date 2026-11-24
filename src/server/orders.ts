import { nextStatuses } from "@/lib/checkout/flow";
import { paymentPlan, priceItem, shippingSelection } from "@/lib/checkout/plan";
import type { OrderEvent, OrderEventType, OrderFile, OrderItem, OrderStatus, OrderView, PaymentMethod, PaymentStatus, ShippingDetails } from "@/lib/checkout/types";
import type { Locale } from "@/lib/catalog/types";
import { normalizeDesign } from "@/lib/design/logic";
import { normalizePhone } from "@/lib/group/rules";
import { needsRoster } from "@/lib/order/roster";
import type { OrderDraft } from "@/lib/order/types";
import { shippingFor } from "@/lib/pricing/engine";
import type { DesignSelection, PersonalizationSelection, Quote } from "@/lib/pricing/types";
import type { CheckoutInput } from "@/lib/validation";
import { assetExists } from "./assets";
import { getLiveCatalog } from "./catalog-store";
import { getDb } from "./db";
import { ApiFailure } from "./errors";
import { imageAssetIds } from "./groups";
import { readOrderFile, saveOrderFile } from "./order-files";
import { hashSecret, newCode, newId, newSecret, secretMatches } from "./tokens";

export type OrderErrorCode =
  | "notFound"
  | "unauthorized"
  | "invalid"
  | "designProblem"
  | "missingAssets"
  | "paymentMethod"
  | "conflict"
  | "badType"
  | "tooBig"
  | "tooManyFiles"
  | "wrongStatus";

export class OrderError extends ApiFailure {
  declare code: OrderErrorCode;
  constructor(code: OrderErrorCode, status: number, details?: unknown) {
    super(code, status, details);
  }
}

interface OrderRow {
  id: string;
  code: string;
  key_hash: string;
  request_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  upfront: number;
  on_delivery: number;
  paid_amount: number;
  items_total: number;
  shipping_fee: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  shipping_json: string;
  notes: string;
  locale: Locale;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  design_json: string;
  order_json: string;
  quote_json: string;
  group_code: string;
}

interface EventRow {
  type: OrderEventType;
  note: string;
  file_ids: string;
  created_at: string;
  actor: string;
}

interface FileRow {
  id: string;
  kind: "receipt" | "proof";
  type: string;
  created_at: string;
}

const MAX_RECEIPTS = 10;

function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Adds a timeline entry. `actor` is the team member's name (empty for the customer); customers never see it. */
function addEvent(orderId: string, type: OrderEventType, note: string, fileIds: string[], stamp: string, actor = "") {
  getDb()
    .prepare("INSERT INTO order_events (order_id, type, note, file_ids, created_at, actor) VALUES (?, ?, ?, ?, ?, ?)")
    .run(orderId, type, note, JSON.stringify(fileIds), stamp, actor);
}

/* ---------- Placing an order ---------- */

function cleanShipping(s: CheckoutInput["shipping"]): ShippingDetails {
  const base: ShippingDetails = { method: s.method, governorateId: "", city: "", address: "", school: "" };
  if (s.method === "pickup") return base;
  if (s.method === "delivery") {
    if (s.city.length < 2) throw new OrderError("invalid", 400, ["shipping.city"]);
    if (s.address.length < 5) throw new OrderError("invalid", 400, ["shipping.address"]);
    return { ...base, governorateId: s.governorateId, city: s.city, address: s.address };
  }
  if (s.school.length < 2) throw new OrderError("invalid", 400, ["shipping.school"]);
  return { ...base, governorateId: s.governorateId, school: s.school, address: s.address };
}

/** Keeps the sizes or the per-person list (whichever the design uses), with real size ids only. */
function cleanOrder(order: CheckoutInput["items"][number]["order"], p: PersonalizationSelection, sizeIds: Set<string>): OrderDraft {
  if (needsRoster(p)) {
    if (order.roster.some((r) => r.sizeId && !sizeIds.has(r.sizeId))) throw new OrderError("invalid", 400, ["roster.sizeId"]);
    return {
      sizes: {},
      roster: order.roster.map((r) => ({ id: r.id, name: r.name.trim().replace(/\s+/g, " "), number: r.number.trim(), sizeId: r.sizeId })),
      deliverySpeedId: order.deliverySpeedId,
    };
  }
  const sizes: Record<string, number> = {};
  for (const [sizeId, n] of Object.entries(order.sizes)) {
    if (n <= 0) continue;
    if (!sizeIds.has(sizeId)) throw new OrderError("invalid", 400, ["sizes"]);
    sizes[sizeId] = n;
  }
  return { sizes, roster: [], deliverySpeedId: order.deliverySpeedId };
}

/**
 * Prices everything again from the catalog (the browser never sets a price),
 * then saves the order. Sending the same request again returns the same order.
 */
export function createOrder(input: CheckoutInput, now = new Date()): { code: string } {
  const catalog = getLiveCatalog();

  const phone = normalizePhone(input.customer.phone);
  if (!phone) throw new OrderError("invalid", 400, ["customer.phone"]);

  const shipping = cleanShipping(input.shipping);
  const ship = shippingFor(catalog, shippingSelection(shipping));
  if (ship.fee === null) throw new OrderError("invalid", 400, ["shipping.governorateId"]);

  const sizeIds = new Set(catalog.sizes.map((s) => s.id));
  const items = input.items.map((item, index) => {
    const design = normalizeDesign(catalog, item.design as DesignSelection);
    const order = cleanOrder(item.order, design.personalization, sizeIds);
    const priced = priceItem(catalog, design, order);
    if (priced.blocking) {
      throw new OrderError("designProblem", 400, { item: index, issues: priced.issues.filter((i) => i.severity === "error").map((i) => i.code) });
    }
    const missing = imageAssetIds(priced.design).filter((id) => !assetExists(id));
    if (missing.length) throw new OrderError("missingAssets", 400, missing);
    return { design: priced.design, order, quote: priced.quote, groupCode: item.groupCode ?? "" };
  });

  const itemsTotal = items.reduce((sum, i) => sum + i.quote.total, 0);
  const total = itemsTotal + ship.fee;
  const plan = paymentPlan(catalog.payments, total, input.paymentMethod);
  if (!plan) throw new OrderError("paymentMethod", 400);

  return transaction(() => {
    const db = getDb();
    const existing = db.prepare("SELECT code, key_hash FROM orders WHERE request_id = ?").get(input.requestId) as { code: string; key_hash: string } | undefined;
    if (existing) {
      if (!secretMatches(input.key, existing.key_hash)) throw new OrderError("conflict", 409);
      return { code: existing.code };
    }

    let code = newCode();
    while (db.prepare("SELECT 1 FROM orders WHERE code = ?").get(code)) code = newCode();
    const id = newId();
    const stamp = now.toISOString();
    // With nothing to pay up front, the design work can start straight away.
    const status: OrderStatus = plan.upfront > 0 ? "placed" : "designReview";
    db.prepare(
      `INSERT INTO orders (id, code, key_hash, request_id, status, payment_status, payment_method, upfront, on_delivery, paid_amount,
         items_total, shipping_fee, total, customer_name, customer_phone, customer_email, shipping_json, notes, locale, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      code,
      hashSecret(input.key),
      input.requestId,
      status,
      plan.method,
      plan.upfront,
      plan.onDelivery,
      itemsTotal,
      ship.fee,
      total,
      input.customer.name,
      phone,
      input.customer.email,
      JSON.stringify(shipping),
      input.notes,
      input.locale,
      stamp,
      stamp,
    );
    const insertItem = db.prepare("INSERT INTO order_items (id, order_id, position, design_json, order_json, quote_json, group_code) VALUES (?, ?, ?, ?, ?, ?, ?)");
    items.forEach((item, position) => {
      insertItem.run(newId(), id, position, JSON.stringify(item.design), JSON.stringify(item.order), JSON.stringify(item.quote), item.groupCode);
    });
    addEvent(id, "placed", "", [], stamp);
    console.info(`New order ${code}: ${items.length} item(s), EGP ${total}`);
    return { code };
  });
}

/* ---------- Reading ---------- */

function orderRow(code: string): OrderRow {
  const row = getDb().prepare("SELECT * FROM orders WHERE code = ?").get(code.toUpperCase()) as OrderRow | undefined;
  if (!row) throw new OrderError("notFound", 404);
  return row;
}

function requireKey(code: string, key: string | null): OrderRow {
  const row = orderRow(code);
  if (!secretMatches(key, row.key_hash)) throw new OrderError("unauthorized", 401);
  return row;
}

export function orderExists(code: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM orders WHERE code = ?").get(code.toUpperCase()));
}

function toView(row: OrderRow): OrderView {
  const db = getDb();
  const items: OrderItem[] = (db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY position").all(row.id) as unknown as ItemRow[]).map((r) => ({
    id: r.id,
    design: JSON.parse(r.design_json) as DesignSelection,
    order: JSON.parse(r.order_json) as OrderDraft,
    quote: JSON.parse(r.quote_json) as Quote,
    groupCode: r.group_code,
  }));
  const events: OrderEvent[] = (db.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY id").all(row.id) as unknown as EventRow[]).map((e) => ({
    type: e.type,
    at: e.created_at,
    note: e.note,
    fileIds: JSON.parse(e.file_ids) as string[],
    actor: e.actor,
  }));
  const files: OrderFile[] = (db.prepare("SELECT * FROM order_files WHERE order_id = ? ORDER BY created_at, rowid").all(row.id) as unknown as FileRow[]).map((f) => ({
    id: f.id,
    kind: f.kind,
    createdAt: f.created_at,
  }));
  return {
    code: row.code,
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    locale: row.locale,
    customer: { name: row.customer_name, phone: row.customer_phone, email: row.customer_email },
    shipping: JSON.parse(row.shipping_json) as ShippingDetails,
    notes: row.notes,
    totals: { items: row.items_total, shipping: row.shipping_fee, total: row.total },
    payment: { method: row.payment_method, upfront: row.upfront, onDelivery: row.on_delivery, paid: row.paid_amount },
    items,
    events,
    files,
    workingDays: Math.max(0, ...items.map((i) => i.quote.delivery.workingDays)),
  };
}

/** The customer's view of their order. Needs the order's private key. Team members' names are left out. */
export function getOrder(code: string, key: string | null): OrderView {
  const view = toView(requireKey(code, key));
  return { ...view, events: view.events.map((e) => ({ type: e.type, at: e.at, note: e.note, fileIds: e.fileIds })) };
}

/** A payment screenshot or proof image, for the customer with the key. */
export function readFileFor(code: string, key: string | null, fileId: string): { data: Buffer; type: string } {
  const row = requireKey(code, key);
  const file = getDb().prepare("SELECT * FROM order_files WHERE id = ? AND order_id = ?").get(fileId, row.id) as FileRow | undefined;
  const data = file ? readOrderFile(row.id, file.id) : null;
  if (!file || !data) throw new OrderError("notFound", 404);
  return { data, type: file.type };
}

/* ---------- Customer actions ---------- */

function saveFiles(row: OrderRow, kind: "receipt" | "proof", images: Buffer[], stamp: string): string[] {
  const saved = images.map((data) => {
    const id = newId();
    const type = saveOrderFile(row.id, id, data);
    if (type === "badType") throw new OrderError("badType", 415);
    if (type === "tooBig") throw new OrderError("tooBig", 413);
    return { id, type, size: data.length };
  });
  const insert = getDb().prepare("INSERT INTO order_files (id, order_id, kind, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  for (const f of saved) insert.run(f.id, row.id, kind, f.type, f.size, stamp);
  return saved.map((f) => f.id);
}

/** The customer uploads a screenshot of their transfer; the team checks it and confirms the payment. */
export function addReceipt(code: string, key: string | null, data: Buffer, now = new Date()): OrderView {
  const row = requireKey(code, key);
  if (row.status === "cancelled" || row.payment_status === "paid" || row.payment_status === "refunded") throw new OrderError("wrongStatus", 409);
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM order_files WHERE order_id = ? AND kind = 'receipt'").get(row.id) as { n: number };
  if (Number(count.n) >= MAX_RECEIPTS) throw new OrderError("tooManyFiles", 409);
  const stamp = now.toISOString();
  transaction(() => {
    const ids = saveFiles(row, "receipt", [data], stamp);
    addEvent(row.id, "receiptUploaded", "", ids, stamp);
    const paymentStatus: PaymentStatus = row.payment_status === "unpaid" ? "receiptSubmitted" : row.payment_status;
    getDb().prepare("UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?").run(paymentStatus, stamp, row.id);
  });
  return getOrder(code, key);
}

/** The customer approves the proof, or asks for changes with a comment. */
export function respondToProof(code: string, key: string | null, response: { approve: boolean; comment: string }, now = new Date()): OrderView {
  const row = requireKey(code, key);
  if (row.status !== "proofSent") throw new OrderError("wrongStatus", 409);
  const comment = response.comment.trim();
  if (!response.approve && comment.length < 2) throw new OrderError("invalid", 400, ["comment"]);
  const stamp = now.toISOString();
  transaction(() => {
    getDb().prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(response.approve ? "proofApproved" : "designReview", stamp, row.id);
    addEvent(row.id, response.approve ? "proofApproved" : "changesRequested", comment, [], stamp);
  });
  return getOrder(code, key);
}

/* ---------- Team actions (the admin panel calls these) ---------- */

/** Records money received (a checked transfer, or cash on delivery). */
export function confirmPayment(code: string, amount: number, now = new Date(), actor = ""): void {
  const row = orderRow(code);
  if (!Number.isInteger(amount) || amount <= 0) throw new OrderError("invalid", 400, ["amount"]);
  const paid = row.paid_amount + amount;
  const paymentStatus: PaymentStatus = paid >= row.total ? "paid" : row.upfront > 0 && paid >= row.upfront ? "depositPaid" : "unpaid";
  // Design work starts once the deposit is in.
  const status: OrderStatus = row.status === "placed" && paid >= row.upfront ? "designReview" : row.status;
  const stamp = now.toISOString();
  transaction(() => {
    getDb().prepare("UPDATE orders SET paid_amount = ?, payment_status = ?, status = ?, updated_at = ? WHERE id = ?").run(paid, paymentStatus, status, stamp, row.id);
    addEvent(row.id, "paymentConfirmed", String(amount), [], stamp, actor);
    if (status !== row.status) addEvent(row.id, "status", status, [], stamp, actor);
  });
}

/** Sends the customer a proof to approve (it replaces any earlier proof). */
export function sendProof(code: string, images: Buffer[], note = "", now = new Date(), actor = ""): void {
  const row = orderRow(code);
  if (!["placed", "designReview", "proofSent"].includes(row.status)) throw new OrderError("wrongStatus", 409);
  if (!images.length) throw new OrderError("invalid", 400, ["images"]);
  const stamp = now.toISOString();
  transaction(() => {
    const ids = saveFiles(row, "proof", images, stamp);
    getDb().prepare("UPDATE orders SET status = 'proofSent', updated_at = ? WHERE id = ?").run(stamp, row.id);
    addEvent(row.id, "proofSent", note, ids, stamp, actor);
  });
}

function rowFlow(row: OrderRow) {
  return { status: row.status, pickup: (JSON.parse(row.shipping_json) as ShippingDetails).method === "pickup", depositMissing: row.paid_amount < row.upfront };
}

/** Moves an order along. Production can't start before the proof is approved and the deposit is paid. */
export function setOrderStatus(code: string, status: OrderStatus, now = new Date(), actor = ""): void {
  const row = orderRow(code);
  if (!nextStatuses(rowFlow(row)).includes(status)) throw new OrderError("wrongStatus", 409, [row.status, status]);
  const stamp = now.toISOString();
  transaction(() => {
    getDb().prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, stamp, row.id);
    addEvent(row.id, "status", status, [], stamp, actor);
  });
}

/* ---------- The team's order list and order page ---------- */

/** What the team needs to do next on an order, if anything. */
export type Attention = "payment" | "proof" | "production" | null;

export interface AdminOrderRow {
  code: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  total: number;
  paid: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  pieces: number;
  delivery: ShippingDetails["method"];
  attention: Attention;
}

export type OrderListView = "action" | "open" | "done" | "cancelled" | "all";

const NEEDS_PAYMENT_CHECK = "o.payment_status = 'receiptSubmitted'";
const NEEDS_PROOF = "o.status IN ('placed', 'designReview') AND o.paid_amount >= o.upfront";
const READY_TO_MAKE = "o.status = 'proofApproved' AND o.paid_amount >= o.upfront";

const VIEW_FILTER: Record<OrderListView, string> = {
  action: `((${NEEDS_PAYMENT_CHECK}) OR (${NEEDS_PROOF}) OR (${READY_TO_MAKE}))`,
  open: "o.status NOT IN ('delivered', 'cancelled')",
  done: "o.status = 'delivered'",
  cancelled: "o.status = 'cancelled'",
  all: "1 = 1",
};

function attentionOf(r: { payment_status: PaymentStatus; status: OrderStatus; paid_amount: number; upfront: number }): Attention {
  if (r.payment_status === "receiptSubmitted") return "payment";
  const depositIn = r.paid_amount >= r.upfront;
  if ((r.status === "placed" || r.status === "designReview") && depositIn) return "proof";
  if (r.status === "proofApproved" && depositIn) return "production";
  return null;
}

const PAGE_SIZE = 50;

/** Orders for the team, newest first, with a search over code, name and phone. */
export function listOrders(opts: { q?: string; view?: OrderListView; page?: number } = {}) {
  const db = getDb();
  const view = opts.view ?? "open";
  const where = [VIEW_FILTER[view]];
  const params: string[] = [];
  const q = (opts.q ?? "").trim();
  if (q) {
    const digits = q.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
    where.push("(o.code LIKE ? OR o.customer_name LIKE ? OR (? != '' AND o.customer_phone LIKE ?))");
    params.push(`%${q.toUpperCase()}%`, `%${q}%`, digits.length >= 3 ? digits : "", `%${digits}%`);
  }
  const whereSql = where.join(" AND ");
  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${whereSql}`).get(...params) as { n: number }).n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pages);
  const rows = db
    .prepare(
      `SELECT o.code, o.created_at, o.customer_name, o.customer_phone, o.total, o.paid_amount, o.upfront, o.status, o.payment_status, o.shipping_json,
         (SELECT COALESCE(SUM(json_extract(i.quote_json, '$.quantity')), 0) FROM order_items i WHERE i.order_id = o.id) AS pieces
       FROM orders o WHERE ${whereSql} ORDER BY o.created_at DESC, o.rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as unknown as (Pick<
    OrderRow,
    "code" | "created_at" | "customer_name" | "customer_phone" | "total" | "paid_amount" | "upfront" | "status" | "payment_status" | "shipping_json"
  > & { pieces: number })[];

  const count = (sql: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM orders o WHERE ${sql}`).get() as { n: number }).n);
  return {
    rows: rows.map(
      (r): AdminOrderRow => ({
        code: r.code,
        createdAt: r.created_at,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        total: r.total,
        paid: r.paid_amount,
        status: r.status,
        paymentStatus: r.payment_status,
        pieces: Number(r.pieces),
        delivery: (JSON.parse(r.shipping_json) as ShippingDetails).method,
        attention: attentionOf(r),
      }),
    ),
    total,
    page,
    pages,
    counts: { payment: count(NEEDS_PAYMENT_CHECK), proof: count(NEEDS_PROOF), production: count(READY_TO_MAKE), open: count(VIEW_FILTER.open) },
  };
}

export interface OrderNote {
  author: string;
  text: string;
  createdAt: string;
}

/** Everything about one order for the team, including team notes and who did each step. */
export function getAdminOrder(code: string): { order: OrderView; notes: OrderNote[]; attention: Attention; next: OrderStatus[] } {
  const row = orderRow(code);
  const notes = (getDb().prepare("SELECT author, text, created_at FROM order_notes WHERE order_id = ? ORDER BY id").all(row.id) as unknown as {
    author: string;
    text: string;
    created_at: string;
  }[]).map((n) => ({ author: n.author, text: n.text, createdAt: n.created_at }));
  return { order: toView(row), notes, attention: attentionOf(row), next: nextStatuses(rowFlow(row)) };
}

/** A note only the team sees. */
export function addNote(code: string, text: string, author: string, now = new Date()): void {
  const row = orderRow(code);
  const clean = text.trim();
  if (!clean || clean.length > 2000) throw new OrderError("invalid", 400, ["text"]);
  getDb().prepare("INSERT INTO order_notes (order_id, author, text, created_at) VALUES (?, ?, ?, ?)").run(row.id, author, clean, now.toISOString());
}

/** Makes a new private link for a customer who lost theirs. The old link stops working. */
export function resetCustomerLink(code: string, author: string, now = new Date()): { key: string } {
  const row = orderRow(code);
  const key = newSecret();
  transaction(() => {
    getDb().prepare("UPDATE orders SET key_hash = ?, updated_at = ? WHERE id = ?").run(hashSecret(key), now.toISOString(), row.id);
    getDb().prepare("INSERT INTO order_notes (order_id, author, text, created_at) VALUES (?, ?, ?, ?)").run(row.id, author, "Made a new customer link. The old link no longer works.", now.toISOString());
  });
  return { key };
}

/** A payment screenshot or proof image, for the team. */
export function readFileForTeam(code: string, fileId: string): { data: Buffer; type: string } {
  const row = orderRow(code);
  const file = getDb().prepare("SELECT * FROM order_files WHERE id = ? AND order_id = ?").get(fileId, row.id) as FileRow | undefined;
  const data = file ? readOrderFile(row.id, file.id) : null;
  if (!file || !data) throw new OrderError("notFound", 404);
  return { data, type: file.type };
}
