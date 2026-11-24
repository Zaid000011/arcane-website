/** One person (one piece) in a personalized order. */
export interface RosterEntry {
  id: string;
  name: string;
  number: string;
  /** Size id, or "" until chosen. */
  sizeId: string;
}

/** Quantities and delivery for the design being ordered. */
export interface OrderDraft {
  /** Pieces per size, used when nothing is personalized per piece. */
  sizes: Record<string, number>;
  /** One row per piece, used when names or numbers are on. */
  roster: RosterEntry[];
  deliverySpeedId: string;
}

export function emptyOrder(): OrderDraft {
  return { sizes: {}, roster: [], deliverySpeedId: "standard" };
}
