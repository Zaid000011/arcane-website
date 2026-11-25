/**
 * Catalog = every product, option and price the site sells.
 * It is plain data so the admin panel can edit it later (stored as a versioned JSON document).
 * Money is whole Egyptian pounds (EGP).
 */

export type Locale = "en" | "ar";

export interface LocalizedText {
  en: string;
  ar: string;
}

export type Sleeve = "short" | "long";

/** Print size tiers. S ≤ 10×10 cm, M ≤ A4, L ≤ A3, AO = all-over (sublimation). */
export type SizeTier = "S" | "M" | "L" | "AO";

export type FabricKind = "cotton" | "blend" | "polyester" | "wool";

export type GarmentView = "front" | "back" | "left" | "right";

export type MockupId = "tshirt" | "hoodie" | "zipHoodie" | "sweatshirt" | "polo" | "varsity";

export interface GsmOption {
  gsm: number;
  priceDelta: number;
  description: LocalizedText;
}

export interface FabricOption {
  id: string;
  name: LocalizedText;
  /** How it looks and feels, in plain words (shown under the name). */
  description?: LocalizedText;
  kind: FabricKind;
  priceDelta: number;
}

export interface Product {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  enabled: boolean;
  /** Base price per sleeve type. A missing key means that sleeve isn't offered. */
  basePrice: Partial<Record<Sleeve, number>>;
  defaultSleeve: Sleeve;
  fitIds: string[];
  gsmOptions: GsmOption[];
  defaultGsm: number;
  fabrics: FabricOption[];
  defaultFabricId: string;
  colorPartIds: string[];
  printAreaIds: string[];
  mockup: MockupId;
}

export interface FitOption {
  id: string;
  name: LocalizedText;
  priceDelta: number;
}

export interface Color {
  id: string;
  name: LocalizedText;
  hex: string;
  /** Light enough for sublimation printing. */
  light: boolean;
  inStock: boolean;
}

export interface ColorPart {
  id: string;
  name: LocalizedText;
  /** Charged per piece when this part's color differs from the body color. */
  contrastFee: number;
}

export interface PrintArea {
  id: string;
  name: LocalizedText;
  view: GarmentView;
  maxTier: SizeTier;
  /** Smaller limit used on short-sleeve garments (e.g. sleeve prints). */
  maxTierShortSleeve?: SizeTier;
  widthCm: number;
  heightCm: number;
}

export interface PrintMethodTraits {
  durability: 1 | 2 | 3 | 4 | 5;
  priceLevel: 1 | 2 | 3;
  feel: LocalizedText;
  bestFor: LocalizedText;
}

export interface PrintMethod {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  /** Price per piece per print area, by size tier. A missing tier isn't offered. */
  prices: Partial<Record<SizeTier, number>>;
  pricedPerColor: boolean;
  maxColors?: number;
  /** One-time fee per print area that uses this method. */
  setupFee: number;
  setupPerColor: boolean;
  minQty: number;
  extraDays: number;
  /** Fabric kinds this method works on. Undefined = all fabrics. */
  fabricKinds?: FabricKind[];
  lightGarmentsOnly?: boolean;
  traits: PrintMethodTraits;
}

export interface PersonalizationPricing {
  name: { perPiece: number };
  number: { perPiece: number };
  namesList: { perPiece: number; setupFee: number; maxNames: number };
  neckLabel: { perPiece: number; setupFee: number };
}

export interface Size {
  id: string;
  label: string;
  surcharge: number;
}

/** One size's garment measurements in cm, taken with the garment laid flat. */
export interface SizeMeasurements {
  sizeId: string;
  /** Across the chest, from armpit to armpit. */
  chest: number;
  /** From the top of the shoulder, next to the collar, down to the hem. */
  length: number;
  /** From the shoulder seam to the end of the sleeve, for each sleeve length the garment comes in. */
  sleeve: Partial<Record<Sleeve, number>>;
}

/** The measurements of one garment in one fit, size by size. */
export interface SizeChart {
  productId: string;
  fitId: string;
  rows: SizeMeasurements[];
}

export interface DeliverySpeed {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  workingDays: number;
  /** Fee as a percent of the subtotal, with a minimum. 0 = free. */
  percent: number;
  minFee: number;
  enabled: boolean;
}

export interface Governorate {
  id: string;
  name: LocalizedText;
}

export interface ShippingZone {
  id: string;
  name: LocalizedText;
  fee: number;
  governorateIds: string[];
}

/** How customers pay for an order. */
export interface PaymentPolicy {
  /** Percent of the total paid before production starts (0–100). The rest is paid in cash on delivery or at pickup. */
  depositPercent: number;
  /** Orders at or below this total may pay everything on delivery instead. 0 = never. */
  codFullMaxTotal: number;
}

export interface Catalog {
  version: number;
  currency: "EGP";
  products: Product[];
  fits: FitOption[];
  colors: Color[];
  colorParts: ColorPart[];
  printAreas: PrintArea[];
  printMethods: PrintMethod[];
  personalization: PersonalizationPricing;
  sizes: Size[];
  /** Garment measurements for each product and fit, shown to customers as the size chart. */
  sizeCharts: SizeChart[];
  deliverySpeeds: DeliverySpeed[];
  governorates: Governorate[];
  shippingZones: ShippingZone[];
  pickup: { enabled: boolean; fee: number };
  payments: PaymentPolicy;
  vat: { rate: number; showSeparately: boolean };
  /** Working-day calendar for delivery estimates. */
  calendar: {
    /** Days off each week, 0 = Sunday … 6 = Saturday. */
    weekend: number[];
    /** "MM-DD" for every year, or "YYYY-MM-DD" for one date (Eids move each year). */
    holidays: string[];
  };
}
