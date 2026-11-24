import type { DesignSelection } from "@/lib/pricing/types";
import { effectiveSizes, needsRoster, totalPieces } from "./roster";
import type { OrderDraft } from "./types";

export type OrderIssueCode = "noPieces" | "rosterMissingName" | "rosterMissingNumber" | "rosterMissingSize" | "rosterDuplicateNumber" | "namesListEmpty";

export interface OrderIssue {
  code: OrderIssueCode;
  severity: "error" | "warning";
  params?: Record<string, string | number>;
}

/** Checks the quantities and the list of names before an order can go to the cart. */
export function orderIssues(design: DesignSelection, order: OrderDraft): OrderIssue[] {
  const p = design.personalization;
  const issues: OrderIssue[] = [];
  if (totalPieces(effectiveSizes(order, p)) === 0) issues.push({ code: "noPieces", severity: "error" });

  if (needsRoster(p)) {
    const missingSize = order.roster.filter((r) => !r.sizeId).length;
    if (missingSize) issues.push({ code: "rosterMissingSize", severity: "error", params: { count: missingSize } });
    if (p.names) {
      const missing = order.roster.filter((r) => !r.name.trim()).length;
      if (missing) issues.push({ code: "rosterMissingName", severity: "error", params: { count: missing } });
    }
    if (p.numbers) {
      const missing = order.roster.filter((r) => !r.number.trim()).length;
      if (missing) issues.push({ code: "rosterMissingNumber", severity: "error", params: { count: missing } });
      const seen = new Map<string, number>();
      for (const r of order.roster) if (r.number.trim()) seen.set(r.number.trim(), (seen.get(r.number.trim()) ?? 0) + 1);
      const dupes = [...seen].filter(([, n]) => n > 1).map(([num]) => num);
      if (dupes.length) issues.push({ code: "rosterDuplicateNumber", severity: "warning", params: { numbers: dupes.join(", ") } });
    }
  }

  if (p.namesList && !(p.namesListNames?.length ?? 0)) issues.push({ code: "namesListEmpty", severity: "error" });
  return issues;
}
