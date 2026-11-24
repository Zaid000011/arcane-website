import type { OrderStatus } from "./types";

/**
 * Which production step can follow which. Shared by the server (which
 * enforces it) and the admin order page (which only offers these buttons).
 * Proofs are sent and approved through their own actions, not here.
 */
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  placed: ["designReview", "cancelled"],
  designReview: ["cancelled"],
  proofSent: ["designReview", "cancelled"],
  proofApproved: ["inProduction", "designReview", "cancelled"],
  inProduction: ["qualityCheck", "cancelled"],
  qualityCheck: ["shipped", "readyForPickup", "inProduction", "cancelled"],
  shipped: ["delivered"],
  readyForPickup: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Steps the team can move an order to now. Production needs the deposit; courier steps depend on pickup or delivery. */
export function nextStatuses(o: { status: OrderStatus; pickup: boolean; depositMissing: boolean }): OrderStatus[] {
  return NEXT[o.status].filter((s) => {
    if (o.depositMissing && (s === "inProduction" || (o.status === "placed" && s === "designReview"))) return false;
    if (s === "shipped" && o.pickup) return false;
    if (s === "readyForPickup" && !o.pickup) return false;
    return true;
  });
}
