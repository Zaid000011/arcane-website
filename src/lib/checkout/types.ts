import type { Locale } from "@/lib/catalog/types";
import type { OrderDraft } from "@/lib/order/types";
import type { DesignSelection, Quote } from "@/lib/pricing/types";

export type DeliveryMethod = "delivery" | "school" | "pickup";

/** Where the order goes. Unused fields are empty strings. */
export interface ShippingDetails {
  method: DeliveryMethod;
  governorateId: string;
  /** City or area (home delivery). */
  city: string;
  /** Street, building and flat, or campus details for school delivery. */
  address: string;
  /** School or university name (school delivery). */
  school: string;
}

/**
 * "transfer": the deposit (or the full amount) by InstaPay or wallet transfer, the rest in cash on delivery.
 * "cod": everything in cash on delivery, only when the payment policy allows it for this total.
 */
export type PaymentMethod = "transfer" | "cod";

export interface PaymentPlan {
  method: PaymentMethod;
  /** Paid before production starts. */
  upfront: number;
  /** Paid in cash on delivery or at pickup. */
  onDelivery: number;
}

/** Production steps. Payment is tracked separately in PaymentStatus. */
export type OrderStatus =
  | "placed"
  | "designReview"
  | "proofSent"
  | "proofApproved"
  | "inProduction"
  | "qualityCheck"
  | "shipped"
  | "readyForPickup"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "unpaid" | "receiptSubmitted" | "depositPaid" | "paid" | "refunded";

export type OrderEventType = "placed" | "receiptUploaded" | "paymentConfirmed" | "proofSent" | "proofApproved" | "changesRequested" | "status";

export interface OrderEvent {
  type: OrderEventType;
  at: string;
  /** Status name for "status" events, amount for payments, or the customer's comment. */
  note: string;
  fileIds: string[];
  /** Team member who did it (team view only). */
  actor?: string;
}

export interface OrderFile {
  id: string;
  kind: "receipt" | "proof";
  createdAt: string;
}

export interface OrderItem {
  id: string;
  design: DesignSelection;
  order: OrderDraft;
  quote: Quote;
  groupCode: string;
}

/** Everything the customer sees on their private order page. */
export interface OrderView {
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  locale: Locale;
  customer: { name: string; phone: string; email: string };
  shipping: ShippingDetails;
  notes: string;
  totals: { items: number; shipping: number; total: number };
  payment: PaymentPlan & { paid: number };
  items: OrderItem[];
  events: OrderEvent[];
  files: OrderFile[];
  /** Longest production time of the items, in working days after the proof is approved. */
  workingDays: number;
}
