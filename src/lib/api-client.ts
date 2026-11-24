"use client";

import { getAsset } from "@/lib/design/assets";
import type { DesignSelection } from "@/lib/pricing/types";

/** Error from the server, with a code the pages translate. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public details?: unknown,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData; key?: string | null } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(opts.key ? { "x-arcane-key": opts.key } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
  if (!res.ok) throw new ApiError(data.error ?? "server", data.details);
  return data as T;
}

/** Uploads the design's images from this device so the team (or other people) can see them. */
export async function uploadDesignAssets(design: DesignSelection): Promise<void> {
  const ids = [...new Set(design.prints.flatMap((p) => (p.elements ?? []).filter((e) => e.type === "image").map((e) => (e as { assetId: string }).assetId)))];
  for (const id of ids) {
    const blob = await getAsset(id);
    if (!blob) continue; // Already on the server (opened from a shared link), or the server will report it missing.
    const form = new FormData();
    form.append("id", id);
    form.append("file", blob);
    const res = await fetch("/api/assets", { method: "POST", body: form }).catch(() => null);
    if (!res || !res.ok) throw new ApiError("missingAssets", [id]);
  }
}

/** Reads "#key=…" or "#member=ID.KEY" from the address, then removes it so it isn't shared by accident. */
export function takeHashParams(): Record<string, string> {
  if (typeof window === "undefined" || !window.location.hash) return {};
  const params = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)));
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return params;
}

/** Opens WhatsApp to share a message with anyone. */
export function whatsappShare(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens a WhatsApp chat with one number (international format without "+"). */
export function whatsappTo(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
