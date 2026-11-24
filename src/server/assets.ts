import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./db";

/**
 * Uploaded artwork, stored as files in .data/assets/ during development.
 * In production this moves to object storage (Supabase Storage or S3).
 */

export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

export type AssetType = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

function dir() {
  return path.join(dataDir(), "assets");
}

function filePath(id: string) {
  if (!ID_RE.test(id)) throw new Error("bad asset id");
  return path.join(dir(), id);
}

/** Works out the real file type from its first bytes, ignoring what the browser claimed. */
export function sniffType(data: Buffer): AssetType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const head = data.subarray(0, 2048).toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase();
  if ((head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) && head.includes("<svg")) return "image/svg+xml";
  return null;
}

export function assetExists(id: string): boolean {
  return ID_RE.test(id) && fs.existsSync(filePath(id));
}

/** Saves an asset once; the first upload for an id wins so nobody can replace someone else's artwork. */
export function saveAsset(id: string, data: Buffer): "saved" | "exists" | "badType" | "tooBig" {
  if (data.length > MAX_ASSET_BYTES) return "tooBig";
  const type = sniffType(data);
  if (!type) return "badType";
  if (assetExists(id)) return "exists";
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(filePath(id), data, { flag: "wx" });
  fs.writeFileSync(`${filePath(id)}.json`, JSON.stringify({ type, size: data.length, createdAt: new Date().toISOString() }));
  return "saved";
}

export function readAsset(id: string): { data: Buffer; type: AssetType } | null {
  if (!assetExists(id)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(`${filePath(id)}.json`, "utf8")) as { type: AssetType };
    return { data: fs.readFileSync(filePath(id)), type: meta.type };
  } catch {
    return null;
  }
}
