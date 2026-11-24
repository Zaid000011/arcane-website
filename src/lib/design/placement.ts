import type { Sleeve } from "@/lib/catalog/types";

/**
 * Where each print area sits on the garment, in cm. The 3D view places prints
 * here and the workshop sheet prints the same measurements, so they always agree.
 */
export interface AreaPlacement {
  /** What the measurement starts from. */
  from: "frontNeck" | "backNeck" | "hoodSeam" | "shoulder";
  /** From that point to the top edge of the print box (up the hood for hood prints). */
  downCm: number;
  /** Box center to the wearer's left (+) or right (−) of the middle. 0 = centered. */
  sideCm: number;
  /** Sleeve prints: wearer's left (1) or right (−1). */
  sleeve?: 1 | -1;
}

export function placementOf(areaId: string, sleeve: Sleeve): AreaPlacement | null {
  const sleeveDown = sleeve === "long" ? 9 : 4;
  switch (areaId) {
    case "frontCenter":
      return { from: "frontNeck", downCm: 5, sideCm: 0 };
    case "fullFront":
      return { from: "frontNeck", downCm: 3, sideCm: 0 };
    case "leftChest":
      return { from: "frontNeck", downCm: 6, sideCm: 10.5 };
    case "rightChest":
      return { from: "frontNeck", downCm: 6, sideCm: -10.5 };
    case "backNeck":
      return { from: "backNeck", downCm: 2.5, sideCm: 0 };
    case "backUpper":
      return { from: "backNeck", downCm: 6, sideCm: 0 };
    case "fullBack":
      return { from: "backNeck", downCm: 5, sideCm: 0 };
    case "hood":
      return { from: "hoodSeam", downCm: 11, sideCm: 0 };
    case "leftSleeve":
      return { from: "shoulder", downCm: sleeveDown, sideCm: 0, sleeve: 1 };
    case "rightSleeve":
      return { from: "shoulder", downCm: sleeveDown, sideCm: 0, sleeve: -1 };
    default:
      return null;
  }
}

/** The placement as a workshop instruction. */
export function placementText(p: AreaPlacement): string {
  const side = p.sideCm === 0 ? "centered" : `its center ${Math.abs(p.sideCm)} cm to the wearer's ${p.sideCm > 0 ? "left" : "right"} of the middle`;
  switch (p.from) {
    case "frontNeck":
      return `Top of the box ${p.downCm} cm below the front neckline, ${side}.`;
    case "backNeck":
      return `Top of the box ${p.downCm} cm below the back neckline, ${side}.`;
    case "hoodSeam":
      return `Centered on the back of the hood, top of the box about ${p.downCm} cm above the neck seam.`;
    case "shoulder":
      return `Top of the box ${p.downCm} cm down the ${p.sleeve === 1 ? "left" : "right"} sleeve from the shoulder seam, centered on the sleeve.`;
  }
}
