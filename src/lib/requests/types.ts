/**
 * "Send it to us" requests: a customer sends their own design, a color they
 * couldn't find or a size that isn't on the list, and the team replies on
 * WhatsApp. Shared by the form, the server and the admin panel.
 */

export type RequestKind = "design" | "color" | "size";
export const REQUEST_KINDS: RequestKind[] = ["design", "color", "size"];

export type RequestStatus = "new" | "contacted" | "done";

export const MAX_REQUEST_FILES = 5;
export const MAX_REQUEST_FILE_MB = 20;
export const MAX_REQUEST_FILE_BYTES = MAX_REQUEST_FILE_MB * 1024 * 1024;
/** The whole upload together (several files). */
export const MAX_REQUEST_TOTAL_BYTES = 50 * 1024 * 1024;

/** For the file picker. The server checks the real type from the file's first bytes. */
export const REQUEST_FILE_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg,.pdf,.ai,.eps,.psd,image/png,image/jpeg,image/webp,image/svg+xml,application/pdf";
export const REQUEST_PHOTO_ACCEPT = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg", "pdf", "ai", "eps", "psd"];

/** Quick check in the browser before uploading. */
export function looksLikeRequestFile(name: string, photosOnly = false): boolean {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return photosOnly ? ["png", "jpg", "jpeg", "webp"].includes(ext) : EXTENSIONS.includes(ext);
}

export interface SizeMeasurements {
  /** Flat chest width, armpit to armpit (cm). */
  chest: number;
  /** Top of the shoulder to the hem (cm). */
  length: number;
  sleeve?: number;
  height?: number;
  weight?: number;
  /** Pieces needed in this size. */
  count: number;
}

export interface RequestFileView {
  id: string;
  name: string;
  type: string;
  size: number;
}

/** One request as the team sees it. */
export interface RequestView {
  code: string;
  kind: RequestKind;
  status: RequestStatus;
  name: string;
  phone: string;
  locale: "en" | "ar";
  productId: string;
  quantity: number | null;
  color: { hex: string; name: string } | null;
  size: SizeMeasurements | null;
  message: string;
  teamNote: string;
  files: RequestFileView[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

/** How a request number is shown: "R-K7QM2X". */
export const requestRef = (code: string) => `R-${code}`;
