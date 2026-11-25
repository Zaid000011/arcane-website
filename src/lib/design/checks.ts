import type { DesignSelection } from "@/lib/pricing/types";
import { DPI_MIN, DPI_WARN, imageDpi } from "./geometry";

export type DesignIssueCode = "artworkTooLowRes" | "artworkLowRes" | "emptyPrintArea";

export interface DesignIssue {
  code: DesignIssueCode;
  severity: "error" | "warning";
  params?: Record<string, string | number>;
}

/** Artwork checks that sit next to the pricing issues (they block checkout when severity is "error"). */
export function designIssues(design: DesignSelection): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const perSide = new Map<string, number>();
  for (const print of design.prints) {
    const n = (perSide.get(print.areaId) ?? 0) + 1;
    perSide.set(print.areaId, n);
    const where = { areaId: print.areaId, n };
    const elements = print.elements ?? [];
    if (elements.length === 0) {
      issues.push({ code: "emptyPrintArea", severity: "warning", params: where });
      continue;
    }
    for (const el of elements) {
      if (el.type !== "image") continue;
      const dpi = imageDpi(el);
      if (dpi < DPI_MIN) issues.push({ code: "artworkTooLowRes", severity: "error", params: { ...where, name: el.name, dpi } });
      else if (dpi < DPI_WARN) issues.push({ code: "artworkLowRes", severity: "warning", params: { ...where, name: el.name, dpi } });
    }
  }
  return issues;
}
