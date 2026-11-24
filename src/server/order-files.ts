import fs from "node:fs";
import path from "node:path";
import { sniffType } from "./assets";
import { dataDir } from "./db";

/**
 * Private files for one order: payment screenshots and design proofs, in
 * .data/orders/<order id>/. They're only served together with the order's key.
 */

export const MAX_ORDER_FILE_BYTES = 10 * 1024 * 1024;
const ID_RE = /^[a-f0-9-]{36}$/;

export type OrderFileType = "image/png" | "image/jpeg" | "image/webp";

function filePath(orderId: string, fileId: string): string {
  if (!ID_RE.test(orderId) || !ID_RE.test(fileId)) throw new Error("bad id");
  return path.join(dataDir(), "orders", orderId, fileId);
}

export function saveOrderFile(orderId: string, fileId: string, data: Buffer): OrderFileType | "badType" | "tooBig" {
  if (data.length > MAX_ORDER_FILE_BYTES) return "tooBig";
  const type = sniffType(data);
  // Screenshots and photos only: SVG files can carry scripts.
  if (type !== "image/png" && type !== "image/jpeg" && type !== "image/webp") return "badType";
  const file = filePath(orderId, fileId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { flag: "wx" });
  return type;
}

export function readOrderFile(orderId: string, fileId: string): Buffer | null {
  try {
    return fs.readFileSync(filePath(orderId, fileId));
  } catch {
    return null;
  }
}
