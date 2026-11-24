import fs from "node:fs";
import path from "node:path";
import { sniffType } from "./assets";
import { dataDir } from "./db";

/**
 * Files customers send with a "send it to us" request (their own design, or a
 * photo of a color), kept privately in .data/requests/<request id>/. Only
 * signed-in team members can open them.
 */

export type RequestFileType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/svg+xml"
  | "application/pdf"
  | "image/vnd.adobe.photoshop"
  | "application/postscript";

export const PHOTO_TYPES: RequestFileType[] = ["image/png", "image/jpeg", "image/webp"];

const ID_RE = /^[a-f0-9-]{36}$/;

/** Works out the real file type from its first bytes, ignoring the name and what the browser claimed. */
export function sniffRequestFile(data: Buffer): RequestFileType | null {
  const image = sniffType(data);
  if (image) return image;
  // PDF (modern Illustrator .ai files are PDFs too). The header may come after a little junk.
  if (data.subarray(0, 1024).includes("%PDF-")) return "application/pdf";
  if (data.subarray(0, 4).toString("latin1") === "8BPS") return "image/vnd.adobe.photoshop";
  if (data.subarray(0, 4).toString("latin1") === "%!PS") return "application/postscript"; // EPS and older .ai files
  if (data.length >= 4 && data.readUInt32BE(0) === 0xc5d0d3c6) return "application/postscript"; // EPS with a preview image
  return null;
}

/** A file name that is safe to store and to offer as a download. */
export function safeFileName(name: string): string {
  const clean = name
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (clean.length > 120 ? clean.slice(-120) : clean) || "file";
}

function filePath(requestId: string, fileId: string): string {
  if (!ID_RE.test(requestId) || !ID_RE.test(fileId)) throw new Error("bad id");
  return path.join(dataDir(), "requests", requestId, fileId);
}

export function saveRequestFile(requestId: string, fileId: string, data: Buffer) {
  const file = filePath(requestId, fileId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { flag: "wx" });
}

export function readRequestFile(requestId: string, fileId: string): Buffer | null {
  try {
    return fs.readFileSync(filePath(requestId, fileId));
  } catch {
    return null;
  }
}

/** Removes a request's files (used when saving the request fails halfway). */
export function removeRequestFiles(requestId: string) {
  if (!ID_RE.test(requestId)) return;
  fs.rmSync(path.join(dataDir(), "requests", requestId), { recursive: true, force: true });
}
