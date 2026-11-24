"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newElementId } from "@/lib/design/types";
import type { OrderDraft } from "@/lib/order/types";
import type { DesignSelection } from "@/lib/pricing/types";
import { guardedLocalStorage } from "@/lib/storage";

export interface CartItem {
  id: string;
  addedAt: string;
  design: DesignSelection;
  order: OrderDraft;
  /** Set when the item came from a closed group order. */
  groupCode?: string;
}

interface CartState {
  items: CartItem[];
  add: (design: DesignSelection, order: OrderDraft, groupCode?: string) => string;
  replace: (id: string, design: DesignSelection, order: OrderDraft) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const snapshot = <T,>(value: T): T => structuredClone(value);
const cartStorage = guardedLocalStorage();

/** The cart, saved on this device until checkout. */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (design, order, groupCode) => {
        const id = newElementId();
        set({ items: [...get().items, { id, addedAt: new Date().toISOString(), design: snapshot(design), order: snapshot(order), ...(groupCode ? { groupCode } : {}) }] });
        return id;
      },
      replace: (id, design, order) =>
        set({ items: get().items.map((item) => (item.id === id ? { ...item, design: snapshot(design), order: snapshot(order) } : item)) }),
      duplicate: (id) => {
        const items = get().items;
        const i = items.findIndex((item) => item.id === id);
        if (i < 0) return;
        const copy = { ...snapshot(items[i]!), id: newElementId(), addedAt: new Date().toISOString() };
        set({ items: [...items.slice(0, i + 1), copy, ...items.slice(i + 1)] });
      },
      remove: (id) => set({ items: get().items.filter((item) => item.id !== id) }),
      clear: () => set({ items: [] }),
    }),
    {
      name: "arcane-cart-v1",
      storage: createJSONStorage(() => cartStorage.storage),
      onRehydrateStorage: () => () => cartStorage.markLoaded(),
      skipHydration: true,
    },
  ),
);

/** Must run before changing the cart, or the saved items would be overwritten. */
export async function ensureCartLoaded(): Promise<void> {
  if (!useCartStore.persist.hasHydrated()) await useCartStore.persist.rehydrate();
}

/** Loads the saved cart once on the client; true when it's ready to show. */
export function useCartReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.resolve(useCartStore.persist.rehydrate()).then(() => setReady(true));
  }, []);
  return ready;
}
