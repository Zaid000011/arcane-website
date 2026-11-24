import type { LocalizedText, SizeTier, Sleeve } from "@/lib/catalog/types";
import type { DesignElement } from "@/lib/design/types";

export interface PrintSelection {
  areaId: string;
  methodId: string;
  tier: SizeTier;
  /** Only used by methods priced per color (screen print). */
  colorCount?: number;
  /** Artwork inside the print box. Doesn't affect price (the size tier does). */
  elements?: DesignElement[];
}

/** How a name, number or names list looks on the garment (doesn't affect price). */
export interface PersonalStyle {
  areaId: string;
  fontId: string;
  color: string;
  /** Letter height in mm (names list sizes itself to fit). */
  sizeMm: number;
}

export interface PersonalizationSelection {
  names: boolean;
  numbers: boolean;
  namesList: boolean;
  namesListCount?: number;
  neckLabel: boolean;
  nameStyle?: PersonalStyle;
  numberStyle?: PersonalStyle;
  namesListStyle?: PersonalStyle;
  /** The class list printed on every piece. */
  namesListNames?: string[];
  neckLabelText?: string;
}

/** Everything chosen in the designer. */
export interface DesignSelection {
  productId: string;
  sleeve: Sleeve;
  fitId: string;
  gsm: number;
  fabricId: string;
  bodyColorId: string;
  /** Color per garment part (hood lining, cuffs…). Missing = same as body. */
  partColors: Record<string, string>;
  prints: PrintSelection[];
  personalization: PersonalizationSelection;
}

export type ShippingSelection =
  | { method: "pickup" }
  | { method: "delivery" | "school"; governorateId: string };

export interface Promo {
  code: string;
  type: "percent" | "fixed";
  value: number;
}

/** Quantities, delivery and shipping. */
export interface OrderSelection {
  /** Pieces per size id, e.g. { M: 10, L: 5 }. */
  sizes: Record<string, number>;
  deliverySpeedId: string;
  shipping?: ShippingSelection;
  promo?: Promo;
}

export type QuoteLineKind = "garment" | "option" | "color" | "print" | "personalization" | "size" | "setup";

export interface QuoteLine {
  id: string;
  kind: QuoteLineKind;
  label: LocalizedText;
  /** Price for one unit of this line. */
  unit: number;
  qty: number;
  amount: number;
}

export type QuoteIssueCode =
  | "unknownProduct"
  | "productDisabled"
  | "invalidSleeve"
  | "invalidFit"
  | "invalidGsm"
  | "invalidFabric"
  | "invalidColor"
  | "colorOutOfStock"
  | "invalidArea"
  | "duplicateArea"
  | "invalidMethod"
  | "tierTooLarge"
  | "tierNotOffered"
  | "methodFabricMismatch"
  | "methodNeedsLightGarment"
  | "tooManyColors"
  | "minQuantity"
  | "namesListTooLong"
  | "invalidDeliverySpeed"
  | "unknownGovernorate"
  | "pickupUnavailable";

export interface QuoteIssue {
  code: QuoteIssueCode;
  severity: "error" | "warning";
  /** Extra values for the message, e.g. { methodId: "screen", minQty: 24 }. */
  params?: Record<string, string | number>;
}

export interface Quote {
  currency: "EGP";
  quantity: number;
  /** Price of one standard-size piece (no size surcharge, no one-time fees). */
  unitPrice: number;
  /** Per-piece lines (unit × quantity) followed by size surcharge lines. */
  lines: QuoteLine[];
  /** One-time fees (screen setup, digitizing, layouts). */
  setupLines: QuoteLine[];
  itemsTotal: number;
  /** Sum of one-time fees (shown even before quantities are entered). */
  setupTotal: number;
  /** itemsTotal + setupTotal, or 0 while the quantity is 0. */
  subtotal: number;
  discount: number;
  delivery: { speedId: string; fee: number; workingDays: number };
  /** null until a shipping option is chosen. */
  shipping: { fee: number | null; zoneId?: string };
  total: number;
  /** VAT portion already included in the total (prices are VAT-inclusive). */
  vatIncluded: number;
  issues: QuoteIssue[];
}
