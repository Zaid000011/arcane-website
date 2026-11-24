"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GarmentSide } from "./areas";
import { emptyOrder, type OrderDraft } from "@/lib/order/types";
import { guardedLocalStorage } from "@/lib/storage";
import type { DesignSelection } from "@/lib/pricing/types";

export type DesignerStep = "garment" | "fabric" | "colors" | "prints" | "names" | "sizes" | "review";
export const DESIGNER_STEPS: DesignerStep[] = ["garment", "fabric", "colors", "prints", "names", "sizes", "review"];

export interface Selection {
  areaId: string;
  elementId: string | null;
}

const designStorage = guardedLocalStorage();

const HISTORY_LIMIT = 60;
const COALESCE_MS = 900;

interface DesignState {
  /** null until loaded from this device (or created fresh). */
  design: DesignSelection | null;
  view: GarmentSide;
  step: DesignerStep;
  selection: Selection | null;
  zoomed: boolean;
  past: DesignSelection[];
  future: DesignSelection[];
  lastCoalesce: { key: string; at: number } | null;
  /** Sizes, name list and delivery speed for this design. */
  order: OrderDraft;
  /** Set when the design was opened from the cart to be edited. */
  editingCartItemId: string | null;
  setOrder: (order: OrderDraft) => void;
  setEditingCartItemId: (id: string | null) => void;

  /** Replace the design without touching undo history (loading, auto-fixes). */
  setDesign: (design: DesignSelection) => void;
  /**
   * Apply a change and record it for undo. Changes with the same `coalesce`
   * key in quick succession (slider drags, typing) become one undo step.
   */
  commit: (design: DesignSelection, coalesce?: string) => void;
  /** Record the current design before a drag starts; follow with setDesign during the drag. */
  beginGesture: () => void;
  undo: () => void;
  redo: () => void;
  setView: (view: GarmentSide) => void;
  setStep: (step: DesignerStep) => void;
  select: (selection: Selection | null) => void;
  setZoomed: (zoomed: boolean) => void;
}

/** The design in progress, saved to this device so it survives a refresh. */
export const useDesignStore = create<DesignState>()(
  persist(
    (set, get) => ({
      design: null,
      view: "front",
      step: "garment",
      selection: null,
      zoomed: false,
      past: [],
      future: [],
      lastCoalesce: null,
      order: emptyOrder(),
      editingCartItemId: null,

      setDesign: (design) => set({ design }),
      setOrder: (order) => set({ order }),
      setEditingCartItemId: (editingCartItemId) => set({ editingCartItemId }),

      commit: (design, coalesce) => {
        const { design: current, past, lastCoalesce } = get();
        const now = Date.now();
        const merge = Boolean(coalesce && lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < COALESCE_MS);
        set({
          design,
          past: current && !merge ? [...past, current].slice(-HISTORY_LIMIT) : past,
          future: [],
          lastCoalesce: coalesce ? { key: coalesce, at: now } : null,
        });
      },

      beginGesture: () => {
        const { design: current, past } = get();
        if (current) set({ past: [...past, current].slice(-HISTORY_LIMIT), future: [], lastCoalesce: null });
      },

      undo: () => {
        const { design: current, past, future } = get();
        const previous = past[past.length - 1];
        if (!previous || !current) return;
        set({ design: previous, past: past.slice(0, -1), future: [current, ...future], lastCoalesce: null });
      },

      redo: () => {
        const { design: current, past, future } = get();
        const next = future[0];
        if (!next || !current) return;
        set({ design: next, past: [...past, current], future: future.slice(1), lastCoalesce: null });
      },

      setView: (view) => set({ view }),
      setStep: (step) => set({ step }),
      select: (selection) => set({ selection }),
      setZoomed: (zoomed) => set({ zoomed }),
    }),
    {
      name: "arcane-design-v1",
      storage: createJSONStorage(() => designStorage.storage),
      onRehydrateStorage: () => () => designStorage.markLoaded(),
      partialize: (s) => ({ design: s.design, step: s.step, order: s.order, editingCartItemId: s.editingCartItemId }),
      // Older saves may not have an order yet.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<DesignState>;
        const step = saved.step && DESIGNER_STEPS.includes(saved.step) ? saved.step : current.step;
        return { ...current, ...saved, step, order: { ...emptyOrder(), ...(saved.order ?? {}) } };
      },
      skipHydration: true,
    },
  ),
);
