"use client";

import { useEffect, useState } from "react";

/**
 * Uploaded artwork lives in the browser's IndexedDB so a design survives a
 * refresh (localStorage is too small for images). If IndexedDB is blocked
 * (private mode), files are kept in memory for this visit only.
 * They're uploaded to the server when a design is shared (group orders) or ordered.
 */

const DB_NAME = "arcane-designer";
const STORE = "assets";

const memory = new Map<string, Blob>();
const urls = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  memory.set(id, blob);
  await run("readwrite", (s) => s.put(blob, id));
}

export async function getAsset(id: string): Promise<Blob | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  const blob = await run<Blob>("readonly", (s) => s.get(id));
  if (blob) memory.set(id, blob);
  return blob ?? null;
}

/** Artwork from a shared design that isn't on this device: fetch it from the server once. */
async function fromServer(id: string): Promise<Blob | null> {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return null;
  try {
    const res = await fetch(`/api/assets/${id}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    memory.set(id, blob);
    void run("readwrite", (s) => s.put(blob, id));
    return blob;
  } catch {
    return null;
  }
}

export async function assetUrl(id: string): Promise<string | null> {
  const existing = urls.get(id);
  if (existing) return existing;
  const blob = (await getAsset(id)) ?? (await fromServer(id));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

/** Object URL for a stored asset, or null while loading / if it's gone. */
export function useAssetUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? (urls.get(id) ?? null) : null));
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    const known = urls.get(id);
    if (known) {
      setUrl(known);
      return;
    }
    void assetUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}
