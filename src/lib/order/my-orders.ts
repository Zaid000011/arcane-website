"use client";

/**
 * Orders placed from this device, so customers can find them again without an
 * account. Each entry holds the order's private key.
 */

export interface MyOrder {
  code: string;
  key: string;
  createdAt: string;
  total: number;
}

const STORE = "arcane-my-orders";

export function myOrders(): MyOrder[] {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as MyOrder[]) : [];
  } catch {
    return [];
  }
}

export function rememberOrder(order: MyOrder) {
  try {
    localStorage.setItem(STORE, JSON.stringify([order, ...myOrders().filter((o) => o.code !== order.code)].slice(0, 30)));
  } catch {
    // Storage blocked: the order link still works, it just isn't remembered here.
  }
}

export function rememberedOrderKey(code: string): string | null {
  return myOrders().find((o) => o.code === code)?.key ?? null;
}

/** The private link to an order. Anyone with it can see the order, so it's only shared with the customer. */
export function orderUrl(code: string, key: string): string {
  return `${window.location.origin}/track/${code}#key=${key}`;
}

/** A request id (so a retried checkout can't place two orders) and the order's private key. */
export function newOrderSecrets(): { requestId: string; key: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { requestId: uuid(), key };
}

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
