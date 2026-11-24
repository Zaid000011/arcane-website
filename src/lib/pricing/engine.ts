import { sleeveLabels, tierAtMost, tierLabels } from "@/lib/catalog";
import type { Catalog, Color, LocalizedText } from "@/lib/catalog/types";
import type {
  DesignSelection,
  OrderSelection,
  Quote,
  QuoteIssue,
  QuoteIssueCode,
  QuoteLine,
  QuoteLineKind,
  ShippingSelection,
} from "./types";

/**
 * Pure pricing engine. The browser uses it for the live price, and the server
 * runs it again at checkout, so the price can never be set by the client.
 *
 * unit price  = garment + fit + GSM + fabric + contrast parts + prints + personalization
 * items total = Σ (unit price + size surcharge) per piece
 * subtotal    = items total + one-time setup fees
 * total       = subtotal − promo + delivery speed fee + shipping
 */
export function quote(catalog: Catalog, design: DesignSelection, order: OrderSelection): Quote {
  const issues: QuoteIssue[] = [];
  const unitLines: Omit<QuoteLine, "qty" | "amount">[] = [];
  const setupLines: QuoteLine[] = [];
  const methodsUsed = new Set<string>();
  let maxExtraDays = 0;

  const error = (code: QuoteIssueCode, params?: QuoteIssue["params"]) =>
    issues.push({ code, severity: "error", params });
  const warning = (code: QuoteIssueCode, params?: QuoteIssue["params"]) =>
    issues.push({ code, severity: "warning", params });
  const unit = (id: string, kind: QuoteLineKind, label: LocalizedText, amount: number) =>
    unitLines.push({ id, kind, label, unit: Math.round(amount) });
  const once = (id: string, label: LocalizedText, amount: number) =>
    setupLines.push({ id, kind: "setup", label, unit: Math.round(amount), qty: 1, amount: Math.round(amount) });

  const quantity = Object.values(order.sizes).reduce((sum, q) => sum + cleanQty(q), 0);

  const product = catalog.products.find((p) => p.id === design.productId);
  if (!product) {
    error("unknownProduct", { productId: design.productId });
    return finish();
  }
  if (!product.enabled) error("productDisabled", { productId: product.id });

  // Garment + sleeve
  const base = product.basePrice[design.sleeve];
  if (base === undefined) {
    error("invalidSleeve", { sleeve: design.sleeve });
  } else {
    unit("garment", "garment", join(product.name, sleeveLabels[design.sleeve]), base);
  }

  // Fit
  const fit = product.fitIds.includes(design.fitId) ? catalog.fits.find((f) => f.id === design.fitId) : undefined;
  if (!fit) error("invalidFit", { fitId: design.fitId });
  else if (fit.priceDelta !== 0) unit("fit", "option", join(L("Fit", "القصة"), fit.name), fit.priceDelta);

  // Fabric weight
  const gsm = product.gsmOptions.find((g) => g.gsm === design.gsm);
  if (!gsm) error("invalidGsm", { gsm: design.gsm });
  else if (gsm.priceDelta !== 0) unit("gsm", "option", L(`${gsm.gsm} GSM`, `${gsm.gsm} جرام`), gsm.priceDelta);

  // Fabric type
  const fabric = product.fabrics.find((f) => f.id === design.fabricId);
  if (!fabric) error("invalidFabric", { fabricId: design.fabricId });
  else if (fabric.priceDelta !== 0) unit("fabric", "option", fabric.name, fabric.priceDelta);

  // Colors
  const findColor = (id: string): Color | undefined => {
    const color = catalog.colors.find((c) => c.id === id);
    if (!color) error("invalidColor", { colorId: id });
    else if (!color.inStock) error("colorOutOfStock", { colorId: id });
    return color;
  };
  const body = findColor(design.bodyColorId);
  for (const partId of product.colorPartIds) {
    const partColorId = design.partColors[partId];
    if (!partColorId || partColorId === design.bodyColorId) continue;
    const part = catalog.colorParts.find((p) => p.id === partId);
    if (!part || !findColor(partColorId)) continue;
    if (part.contrastFee > 0) {
      unit(`part:${partId}`, "color", join(part.name, L("contrast color", "لون مختلف")), part.contrastFee);
    }
  }

  // Prints
  const usedAreas = new Set<string>();
  for (const print of design.prints) {
    const area = product.printAreaIds.includes(print.areaId)
      ? catalog.printAreas.find((a) => a.id === print.areaId)
      : undefined;
    const method = catalog.printMethods.find((m) => m.id === print.methodId);
    if (!area) {
      error("invalidArea", { areaId: print.areaId });
      continue;
    }
    if (usedAreas.has(area.id)) {
      error("duplicateArea", { areaId: area.id });
      continue;
    }
    usedAreas.add(area.id);
    if (!method) {
      error("invalidMethod", { methodId: print.methodId });
      continue;
    }

    const maxTier = design.sleeve === "short" && area.maxTierShortSleeve ? area.maxTierShortSleeve : area.maxTier;
    let ok = true;
    if (!tierAtMost(print.tier, maxTier)) {
      error("tierTooLarge", { areaId: area.id, tier: print.tier, maxTier });
      ok = false;
    }
    const tierPrice = method.prices[print.tier];
    if (tierPrice === undefined) {
      error("tierNotOffered", { methodId: method.id, tier: print.tier });
      ok = false;
    }
    if (method.fabricKinds && fabric && !method.fabricKinds.includes(fabric.kind)) {
      error("methodFabricMismatch", { methodId: method.id, fabricId: fabric.id });
      ok = false;
    }
    if (method.lightGarmentsOnly && body && !body.light) {
      error("methodNeedsLightGarment", { methodId: method.id, colorId: body.id });
      ok = false;
    }
    const colors = method.pricedPerColor ? Math.max(1, Math.floor(print.colorCount ?? 1)) : 1;
    if (method.maxColors && colors > method.maxColors) {
      error("tooManyColors", { methodId: method.id, maxColors: method.maxColors });
      ok = false;
    }
    if (!ok || tierPrice === undefined) continue;

    methodsUsed.add(method.id);
    maxExtraDays = Math.max(maxExtraDays, method.extraDays);

    const colorNote = method.pricedPerColor ? [colorCountLabel(colors)] : [];
    unit(`print:${area.id}`, "print", join(area.name, method.name, tierLabels[print.tier], ...colorNote), tierPrice * colors);
    if (method.setupFee > 0) {
      const setupAmount = method.setupFee * (method.setupPerColor ? colors : 1);
      once(`setup:${area.id}`, join(L("Setup", "تجهيز"), method.name, area.name, ...colorNote), setupAmount);
    }
  }

  // Personalization
  const p = catalog.personalization;
  const sel = design.personalization;
  if (sel.names) unit("names", "personalization", L("Individual name on each piece", "اسم لكل قطعة"), p.name.perPiece);
  if (sel.numbers) unit("numbers", "personalization", L("Individual number on each piece", "رقم لكل قطعة"), p.number.perPiece);
  if (sel.namesList) {
    unit("namesList", "personalization", L("Class names list on the back", "قائمة أسماء الدفعة على الظهر"), p.namesList.perPiece);
    once("setup:namesList", L("Names list layout", "تنسيق قائمة الأسماء"), p.namesList.setupFee);
    if ((sel.namesListCount ?? 0) > p.namesList.maxNames) {
      error("namesListTooLong", { maxNames: p.namesList.maxNames });
    }
  }
  if (sel.neckLabel) {
    unit("neckLabel", "personalization", L("Custom neck label", "ليبل رقبة مخصص"), p.neckLabel.perPiece);
    once("setup:neckLabel", L("Neck label setup", "تجهيز ليبل الرقبة"), p.neckLabel.setupFee);
  }

  // Minimum quantities
  for (const methodId of methodsUsed) {
    const method = catalog.printMethods.find((m) => m.id === methodId)!;
    if (method.minQty > 1 && quantity < method.minQty) {
      const params = { methodId, minQty: method.minQty };
      if (quantity > 0) error("minQuantity", params);
      else warning("minQuantity", params);
    }
  }

  return finish();

  function finish(): Quote {
    const unitPrice = unitLines.reduce((sum, l) => sum + l.unit, 0);
    const lines: QuoteLine[] = unitLines.map((l) => ({ ...l, qty: quantity, amount: l.unit * quantity }));

    for (const size of catalog.sizes) {
      const qty = cleanQty(order.sizes[size.id]);
      if (qty > 0 && size.surcharge > 0) {
        lines.push({
          id: `size:${size.id}`,
          kind: "size",
          label: L(`${size.label} size`, `مقاس ${size.label}`),
          unit: size.surcharge,
          qty,
          amount: size.surcharge * qty,
        });
      }
    }

    const itemsTotal = lines.reduce((sum, l) => sum + l.amount, 0);
    const setupTotal = setupLines.reduce((sum, l) => sum + l.amount, 0);
    // One-time fees only apply once there is something to make.
    const subtotal = quantity > 0 ? itemsTotal + setupTotal : 0;

    // Promo code
    let discount = 0;
    if (order.promo && subtotal > 0) {
      discount =
        order.promo.type === "percent"
          ? Math.round((subtotal * Math.min(Math.max(order.promo.value, 0), 100)) / 100)
          : Math.min(Math.max(Math.round(order.promo.value), 0), subtotal);
    }

    // Delivery speed
    const speed = catalog.deliverySpeeds.find((s) => s.id === order.deliverySpeedId);
    let deliveryFee = 0;
    if (!speed || !speed.enabled) {
      if (product) error("invalidDeliverySpeed", { speedId: order.deliverySpeedId });
    } else if (speed.percent > 0 && subtotal > 0) {
      deliveryFee = Math.max(Math.round((subtotal * speed.percent) / 100), speed.minFee);
    }
    const workingDays = (speed?.workingDays ?? 0) + maxExtraDays;

    // Shipping
    const ship = shippingFor(catalog, order.shipping);
    if (ship.issue === "unknownGovernorate" && order.shipping?.method !== "pickup") {
      error("unknownGovernorate", { governorateId: order.shipping?.governorateId ?? "" });
    } else if (ship.issue) {
      error(ship.issue);
    }
    const shippingFee = ship.fee;
    const zoneId = ship.zoneId;

    const total = subtotal - discount + deliveryFee + (shippingFee ?? 0);
    const vatIncluded = Math.round(total - total / (1 + catalog.vat.rate));

    return {
      currency: "EGP",
      quantity,
      unitPrice,
      lines,
      setupLines,
      itemsTotal,
      setupTotal,
      subtotal,
      discount,
      delivery: { speedId: order.deliverySpeedId, fee: deliveryFee, workingDays },
      shipping: { fee: shippingFee, zoneId },
      total,
      vatIncluded,
      issues,
    };
  }
}

/** Fee for one delivery: free pickup, or the shipping zone of the governorate. `fee` is null until a valid choice is made. */
export function shippingFor(
  catalog: Catalog,
  ship: ShippingSelection | undefined,
): { fee: number | null; zoneId?: string; issue?: "pickupUnavailable" | "unknownGovernorate" } {
  if (!ship) return { fee: null };
  if (ship.method === "pickup") return catalog.pickup.enabled ? { fee: catalog.pickup.fee } : { fee: null, issue: "pickupUnavailable" };
  const zone = catalog.shippingZones.find((z) => z.governorateIds.includes(ship.governorateId));
  return zone ? { fee: zone.fee, zoneId: zone.id } : { fee: null, issue: "unknownGovernorate" };
}

function cleanQty(q: number | undefined): number {
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? Math.floor(q) : 0;
}

function L(en: string, ar: string): LocalizedText {
  return { en, ar };
}

function join(...parts: LocalizedText[]): LocalizedText {
  return { en: parts.map((p) => p.en).join(" · "), ar: parts.map((p) => p.ar).join(" · ") };
}

function colorCountLabel(n: number): LocalizedText {
  return L(`${n} color${n === 1 ? "" : "s"}`, n === 1 ? "لون واحد" : n === 2 ? "لونان" : `${n} ألوان`);
}

export function hasBlockingIssues(q: Quote): boolean {
  return q.issues.some((i) => i.severity === "error");
}
