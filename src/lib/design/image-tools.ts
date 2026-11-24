"use client";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export interface ImageInfo {
  pxW: number;
  pxH: number;
  vector: boolean;
}

export type UploadError = "tooBig" | "badType" | "unreadable";

export function checkUpload(file: File): UploadError | null {
  if (file.size > MAX_UPLOAD_BYTES) return "tooBig";
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (!isSvg && !ACCEPTED_TYPES.includes(file.type)) return "badType";
  return null;
}

/** Reads pixel size (or the SVG's own size) without uploading anything. */
export async function readImageInfo(file: File): Promise<ImageInfo> {
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (isSvg) {
    const doc = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") throw new Error("unreadable");
    const viewBox = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
    const w = parseFloat(svg.getAttribute("width") ?? "") || viewBox[2] || 1000;
    const h = parseFloat(svg.getAttribute("height") ?? "") || viewBox[3] || 1000;
    return { pxW: w, pxH: h, vector: true };
  }
  const bitmap = await createImageBitmap(file);
  const info = { pxW: bitmap.width, pxH: bitmap.height, vector: false };
  bitmap.close();
  return info;
}

/**
 * Makes the background transparent by flood-filling from the edges with the
 * corner color (works well for logos on white or plain backgrounds).
 * Interior areas of the same color are kept because they aren't connected to the edge.
 */
export async function removeBackground(blob: Blob, tolerance = 42): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width: w, height: h } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Background color = average of the four corners.
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + d[i * 4 + c]!, 0) / 4);
  const tol2 = tolerance * tolerance;
  const dist2 = (i: number) => {
    const r = d[i * 4]! - bg[0]!;
    const g = d[i * 4 + 1]! - bg[1]!;
    const b = d[i * 4 + 2]! - bg[2]!;
    return r * r + g * g + b * b;
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!visited[i] && d[i * 4 + 3]! > 0 && dist2(i) <= tol2) {
      visited[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    d[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }

  // Soften the cut edge: partly fade pixels next to removed ones that are close to the background.
  const soft2 = tol2 * 2.5;
  for (let i = 0; i < w * h; i++) {
    if (visited[i] || d[i * 4 + 3] === 0) continue;
    const x = i % w;
    const nearRemoved = (x > 0 && visited[i - 1]) || (x < w - 1 && visited[i + 1]) || (i >= w && visited[i - w]) || (i < w * (h - 1) && visited[i + w]);
    if (!nearRemoved) continue;
    const dd = dist2(i);
    if (dd < soft2) d[i * 4 + 3] = Math.round(d[i * 4 + 3]! * Math.min(1, dd / soft2 + 0.25));
  }

  ctx.putImageData(img, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/png"));
}
