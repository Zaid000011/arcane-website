import type { Catalog, PaymentPolicy } from "@/lib/catalog/types";
import { designIssues } from "@/lib/design/checks";
import { normalizeDesign } from "@/lib/design/logic";
import { effectiveSizes } from "@/lib/order/roster";
import type { OrderDraft } from "@/lib/order/types";
import { orderIssues } from "@/lib/order/validate";
import { quote } from "@/lib/pricing/engine";
import type { DesignSelection, ShippingSelection } from "@/lib/pricing/types";
import type { PaymentMethod, PaymentPlan, ShippingDetails } from "./types";

/**
 * Checkout math shared by the checkout page (live totals) and the server
 * (which recalculates everything, so the browser can never set a price).
 */

/** Prices one cart item and collects everything that would block ordering it. */
export function priceItem(catalog: Catalog, rawDesign: DesignSelection, order: OrderDraft) {
  const design = normalizeDesign(catalog, rawDesign);
  const priced = quote(catalog, design, { sizes: effectiveSizes(order, design.personalization), deliverySpeedId: order.deliverySpeedId });
  const issues = [...priced.issues, ...designIssues(design), ...orderIssues(design, order)];
  return { design, quote: priced, issues, blocking: issues.some((i) => i.severity === "error") };
}

/** The pricing engine's shipping choice for these delivery details. */
export function shippingSelection(s: Pick<ShippingDetails, "method" | "governorateId">): ShippingSelection | undefined {
  if (s.method === "pickup") return { method: "pickup" };
  return s.governorateId ? { method: s.method, governorateId: s.governorateId } : undefined;
}

/** Payment methods this order total can use, the usual one first. */
export function allowedMethods(policy: PaymentPolicy, total: number): PaymentMethod[] {
  const methods: PaymentMethod[] = [];
  if (policy.depositPercent > 0 && total > 0) methods.push("transfer");
  if (policy.depositPercent <= 0 || (policy.codFullMaxTotal > 0 && total <= policy.codFullMaxTotal)) methods.push("cod");
  return methods;
}

/** How much is paid now and how much on delivery, or null if this method isn't allowed for the total. */
export function paymentPlan(policy: PaymentPolicy, total: number, method: PaymentMethod): PaymentPlan | null {
  if (!allowedMethods(policy, total).includes(method)) return null;
  if (method === "cod") return { method, upfront: 0, onDelivery: total };
  const percent = Math.min(Math.max(policy.depositPercent, 0), 100);
  const upfront = Math.min(total, Math.round((total * percent) / 100));
  return { method, upfront, onDelivery: total - upfront };
}
