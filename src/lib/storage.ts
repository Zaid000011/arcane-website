import type { StateStorage } from "zustand/middleware";

/**
 * localStorage for saved stores that only accepts writes after the store has
 * loaded what was saved before. Without this, a page that touches a store
 * before loading it would overwrite the customer's saved design or cart.
 * Also tolerates browsers where storage is blocked.
 */
export function guardedLocalStorage(): { storage: StateStorage; markLoaded: () => void } {
  let loaded = false;
  return {
    storage: {
      getItem: (name) => {
        try {
          return localStorage.getItem(name);
        } catch {
          return null;
        }
      },
      setItem: (name, value) => {
        if (!loaded) return;
        try {
          localStorage.setItem(name, value);
        } catch {
          // Storage full or blocked: keep working in memory.
        }
      },
      removeItem: (name) => {
        try {
          localStorage.removeItem(name);
        } catch {
          // Ignore.
        }
      },
    },
    markLoaded: () => {
      loaded = true;
    },
  };
}
