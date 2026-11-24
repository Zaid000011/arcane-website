"use client";

import { create } from "zustand";
import type { TextMeasurement } from "./geometry";

/**
 * Real rendered text sizes, by element id. Kept apart from the saved design
 * store on purpose: text is drawn on pages that never load the saved design
 * (cart, previews), and writing to a persisted store from there would
 * overwrite the customer's design in progress.
 */
export const useMeasureStore = create<{
  measurements: Record<string, TextMeasurement>;
  setMeasurement: (id: string, m: TextMeasurement) => void;
}>()((set) => ({
  measurements: {},
  setMeasurement: (id, m) => set((s) => ({ measurements: { ...s.measurements, [id]: m } })),
}));
