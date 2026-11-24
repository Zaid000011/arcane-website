import { normalizePhone } from "@/lib/group/rules";
import {
  MAX_REQUEST_FILE_BYTES,
  MAX_REQUEST_FILES,
  MAX_REQUEST_TOTAL_BYTES,
  type RequestFileView,
  type RequestKind,
  type RequestStatus,
  type RequestView,
  type SizeMeasurements,
} from "@/lib/requests/types";
import type { CustomRequestInput } from "@/lib/validation";
import { getLiveCatalog } from "./catalog-store";
import { getDb } from "./db";
import { ApiFailure } from "./errors";
import { PHOTO_TYPES, readRequestFile, removeRequestFiles, safeFileName, saveRequestFile, sniffRequestFile } from "./request-files";
import { newCode, newId } from "./tokens";

/** "Send it to us" requests: saved from the public form, handled by the team in the admin panel. */

interface RequestRow {
  id: string;
  code: string;
  kind: RequestKind;
  status: RequestStatus;
  name: string;
  phone: string;
  locale: "en" | "ar";
  product_id: string;
  details_json: string;
  message: string;
  team_note: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

interface FileRow {
  id: string;
  request_id: string;
  name: string;
  type: string;
  size: number;
}

interface Details {
  quantity?: number;
  color?: { hex: string; name: string };
  size?: SizeMeasurements;
}

export interface IncomingFile {
  name: string;
  data: Buffer;
}

function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Saves a request and its files. Returns the request number the customer sees. */
export function createRequest(input: CustomRequestInput, files: IncomingFile[], now = new Date()): { code: string } {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new ApiFailure("invalid", 400, ["phone"]);
  if (files.length > MAX_REQUEST_FILES) throw new ApiFailure("invalid", 400, ["files"]);
  if (input.kind === "design" && files.length === 0) throw new ApiFailure("invalid", 400, ["files"]);
  if (input.kind === "size" && files.length > 0) throw new ApiFailure("invalid", 400, ["files"]);
  if (files.reduce((sum, f) => sum + f.data.length, 0) > MAX_REQUEST_TOTAL_BYTES) throw new ApiFailure("tooBig", 413);

  const typed = files.map((f) => {
    if (f.data.length === 0) throw new ApiFailure("invalid", 400, ["files"]);
    if (f.data.length > MAX_REQUEST_FILE_BYTES) throw new ApiFailure("tooBig", 413, [f.name]);
    const type = sniffRequestFile(f.data);
    // Color requests take photos only; designs can also be vector files, PDFs and Photoshop files.
    if (!type || (input.kind === "color" && !PHOTO_TYPES.includes(type))) throw new ApiFailure("badType", 415, [f.name]);
    return { id: newId(), name: safeFileName(f.name), data: f.data, type };
  });

  const catalog = getLiveCatalog();
  const productId = catalog.products.some((p) => p.id === input.productId && p.enabled) ? input.productId : "";
  const details: Details = {
    ...(input.quantity ? { quantity: input.quantity } : {}),
    ...(input.kind === "color" && input.color ? { color: { hex: input.color.hex.toUpperCase(), name: input.color.name } } : {}),
    ...(input.kind === "size" && input.size ? { size: roundMeasurements(input.size) } : {}),
  };

  const db = getDb();
  const id = newId();
  let code = newCode();
  while (db.prepare("SELECT 1 FROM custom_requests WHERE code = ?").get(code)) code = newCode();
  const at = now.toISOString();

  // Files first: if saving the request fails, they're removed again.
  try {
    for (const f of typed) saveRequestFile(id, f.id, f.data);
    transaction(() => {
      db.prepare(
        `INSERT INTO custom_requests (id, code, kind, status, name, phone, locale, product_id, details_json, message, created_at, updated_at)
         VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, code, input.kind, input.name, phone, input.locale, productId, JSON.stringify(details), input.message, at, at);
      const insert = db.prepare("INSERT INTO custom_request_files (id, request_id, position, name, type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      typed.forEach((f, position) => insert.run(f.id, id, position, f.name, f.type, f.data.length, at));
    });
  } catch (e) {
    removeRequestFiles(id);
    throw e;
  }
  console.info(`New ${input.kind} request ${code} with ${typed.length} file(s)`);
  return { code };
}

function roundMeasurements(m: SizeMeasurements): SizeMeasurements {
  const r = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 10) / 10);
  return { chest: r(m.chest)!, length: r(m.length)!, sleeve: r(m.sleeve), height: r(m.height), weight: r(m.weight), count: m.count };
}

function toView(row: RequestRow, files: FileRow[]): RequestView {
  const d = JSON.parse(row.details_json) as Details;
  return {
    code: row.code,
    kind: row.kind,
    status: row.status,
    name: row.name,
    phone: row.phone,
    locale: row.locale,
    productId: row.product_id,
    quantity: d.quantity ?? null,
    color: d.color ?? null,
    size: d.size ?? null,
    message: row.message,
    teamNote: row.team_note,
    files: files.map((f): RequestFileView => ({ id: f.id, name: f.name, type: f.type, size: f.size })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function requestRow(code: string): RequestRow {
  const row = getDb().prepare("SELECT * FROM custom_requests WHERE code = ?").get(String(code).toUpperCase()) as RequestRow | undefined;
  if (!row) throw new ApiFailure("notFound", 404);
  return row;
}

function filesOf(requestIds: string[]): Map<string, FileRow[]> {
  const out = new Map<string, FileRow[]>();
  if (!requestIds.length) return out;
  const rows = getDb()
    .prepare(`SELECT id, request_id, name, type, size FROM custom_request_files WHERE request_id IN (${requestIds.map(() => "?").join(",")}) ORDER BY position`)
    .all(...requestIds) as unknown as FileRow[];
  for (const r of rows) out.set(r.request_id, [...(out.get(r.request_id) ?? []), r]);
  return out;
}

export type RequestListView = "new" | "contacted" | "done" | "all";
const PAGE_SIZE = 20;

export function listRequests(opts: { view?: RequestListView; page?: number } = {}) {
  const db = getDb();
  const view = opts.view ?? "new";
  const where = view === "all" ? "1 = 1" : "status = ?";
  const params = view === "all" ? [] : [view];
  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM custom_requests WHERE ${where}`).get(...params) as { n: number }).n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pages);
  const rows = db
    .prepare(`SELECT * FROM custom_requests WHERE ${where} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as unknown as RequestRow[];
  const files = filesOf(rows.map((r) => r.id));
  const counts = Object.fromEntries(
    (db.prepare("SELECT status, COUNT(*) AS n FROM custom_requests GROUP BY status").all() as unknown as { status: RequestStatus; n: number }[]).map((r) => [r.status, Number(r.n)]),
  ) as Partial<Record<RequestStatus, number>>;
  return {
    rows: rows.map((r) => toView(r, files.get(r.id) ?? [])),
    total,
    page,
    pages,
    counts: { new: counts.new ?? 0, contacted: counts.contacted ?? 0, done: counts.done ?? 0 },
  };
}

export function countNewRequests(): number {
  return Number((getDb().prepare("SELECT COUNT(*) AS n FROM custom_requests WHERE status = 'new'").get() as { n: number }).n);
}

export function getRequest(code: string): RequestView {
  const row = requestRow(code);
  return toView(row, filesOf([row.id]).get(row.id) ?? []);
}

export function updateRequest(code: string, patch: { status?: RequestStatus; teamNote?: string }, actor: string, now = new Date()): RequestView {
  const row = requestRow(code);
  const status = patch.status ?? row.status;
  const note = patch.teamNote === undefined ? row.team_note : patch.teamNote.trim();
  getDb().prepare("UPDATE custom_requests SET status = ?, team_note = ?, updated_by = ?, updated_at = ? WHERE id = ?").run(status, note, actor, now.toISOString(), row.id);
  return getRequest(code);
}

export function readRequestFileForTeam(code: string, fileId: string): { data: Buffer; type: string; name: string } {
  const row = requestRow(code);
  const file = getDb().prepare("SELECT * FROM custom_request_files WHERE id = ? AND request_id = ?").get(fileId, row.id) as FileRow | undefined;
  const data = file ? readRequestFile(row.id, file.id) : null;
  if (!file || !data) throw new ApiFailure("notFound", 404);
  return { data, type: file.type, name: file.name };
}
