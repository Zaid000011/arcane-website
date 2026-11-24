import { getLiveCatalog } from "./catalog-store";
import { designIssues } from "@/lib/design/checks";
import { normalizeDesign } from "@/lib/design/logic";
import { beforeDeadline, cairoToday, daysLeft, normalizeName, normalizePhone, onNameList } from "@/lib/group/rules";
import type { AdminGroup, GroupErrorCode, GroupMember, GroupSettings, GroupStatus, MemberInput, PublicGroup } from "@/lib/group/types";
import { quote } from "@/lib/pricing/engine";
import type { DesignSelection } from "@/lib/pricing/types";
import type { CreateGroupInput, GroupPatch } from "@/lib/validation";
import { assetExists } from "./assets";
import { getDb } from "./db";
import { ApiFailure } from "./errors";
import { hashSecret, newCode, newId, newSecret, secretMatches } from "./tokens";

export class GroupError extends ApiFailure {
  declare code: GroupErrorCode;
  constructor(code: GroupErrorCode, status: number, details?: unknown) {
    super(code, status, details);
  }
}

interface GroupRow {
  id: string;
  code: string;
  admin_key_hash: string;
  name: string;
  organizer_name: string;
  organizer_phone: string;
  organizer_email: string;
  design_json: string;
  delivery_speed_id: string;
  deadline: string;
  status: GroupStatus;
  settings_json: string;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  id: string;
  group_id: string;
  edit_key_hash: string;
  name: string;
  name_key: string;
  phone: string;
  number: string;
  size_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

const MAX_DEADLINE_DAYS = 120;

/* ---------- Reading ---------- */

function groupRow(code: string): GroupRow {
  const row = getDb().prepare("SELECT * FROM group_orders WHERE code = ?").get(code.toUpperCase()) as GroupRow | undefined;
  if (!row) throw new GroupError("notFound", 404);
  return row;
}

function memberRows(groupId: string): MemberRow[] {
  return getDb().prepare("SELECT * FROM group_members WHERE group_id = ? ORDER BY created_at, rowid").all(groupId) as unknown as MemberRow[];
}

function toMember(r: MemberRow): GroupMember {
  return { id: r.id, name: r.name, phone: r.phone, number: r.number, sizeId: r.size_id, quantity: r.quantity, createdAt: r.created_at, updatedAt: r.updated_at };
}

function isOpen(row: GroupRow, now: Date): boolean {
  return row.status === "open" && beforeDeadline(row.deadline, now);
}

function toPublic(row: GroupRow, members: MemberRow[], now: Date): PublicGroup {
  const settings = JSON.parse(row.settings_json) as GroupSettings;
  return {
    code: row.code,
    name: row.name,
    organizerFirstName: row.organizer_name.split(/\s+/)[0] ?? "",
    design: JSON.parse(row.design_json) as DesignSelection,
    deliverySpeedId: row.delivery_speed_id,
    deadline: row.deadline,
    status: row.status,
    settings: { allowedSizes: settings.allowedSizes, allowQuantity: settings.allowQuantity, maxPieces: settings.maxPieces, hasNameList: Boolean(settings.allowedNames?.length) },
    memberCount: members.length,
    pieceCount: members.reduce((sum, m) => sum + m.quantity, 0),
    isOpen: isOpen(row, now),
  };
}

export function getPublicGroup(code: string, now = new Date()): PublicGroup | null {
  try {
    const row = groupRow(code);
    return toPublic(row, memberRows(row.id), now);
  } catch (e) {
    if (e instanceof GroupError && e.code === "notFound") return null;
    throw e;
  }
}

function requireAdmin(code: string, adminKey: string | null): GroupRow {
  const row = groupRow(code);
  if (!secretMatches(adminKey, row.admin_key_hash)) throw new GroupError("unauthorized", 401);
  return row;
}

export function getAdminGroup(code: string, adminKey: string | null, now = new Date()): AdminGroup {
  const row = requireAdmin(code, adminKey);
  const members = memberRows(row.id);
  const pub = toPublic(row, members, now);
  return {
    ...pub,
    settings: JSON.parse(row.settings_json) as GroupSettings,
    organizer: { name: row.organizer_name, phone: row.organizer_phone, email: row.organizer_email },
    members: members.map(toMember),
    createdAt: row.created_at,
  };
}

/* ---------- Creating ---------- */

export function imageAssetIds(design: DesignSelection): string[] {
  return [...new Set(design.prints.flatMap((p) => (p.elements ?? []).filter((e) => e.type === "image").map((e) => (e as { assetId: string }).assetId)))];
}

export function createGroup(input: CreateGroupInput, now = new Date()): { code: string; adminKey: string } {
  const catalog = getLiveCatalog();
  const design = normalizeDesign(catalog, input.design as DesignSelection);

  // The design must be orderable; quantity rules (minimums) are checked when the group closes.
  const priced = quote(catalog, design, { sizes: {}, deliverySpeedId: input.deliverySpeedId });
  const problems = [...priced.issues, ...designIssues(design)].filter((i) => i.severity === "error");
  if (problems.length) throw new GroupError("designProblem", 400, problems.map((p) => p.code));

  const missing = imageAssetIds(design).filter((id) => !assetExists(id));
  if (missing.length) throw new GroupError("missingAssets", 400, missing);

  const left = daysLeft(input.deadline, now);
  if (input.deadline < cairoToday(now) || left > MAX_DEADLINE_DAYS) throw new GroupError("invalid", 400, ["deadline"]);

  const phone = normalizePhone(input.organizer.phone);
  if (!phone) throw new GroupError("invalid", 400, ["organizer.phone"]);

  const allowedSizes = input.settings.allowedSizes.filter((s) => catalog.sizes.some((c) => c.id === s));
  if (!allowedSizes.length) throw new GroupError("invalid", 400, ["settings.allowedSizes"]);

  const settings: GroupSettings = {
    allowedSizes,
    allowQuantity: input.settings.allowQuantity,
    ...(input.settings.maxPieces ? { maxPieces: input.settings.maxPieces } : {}),
    ...(input.settings.allowedNames?.length ? { allowedNames: input.settings.allowedNames } : {}),
  };

  const db = getDb();
  let code = newCode();
  while (db.prepare("SELECT 1 FROM group_orders WHERE code = ?").get(code)) code = newCode();
  const adminKey = newSecret();
  const stamp = now.toISOString();
  db.prepare(
    `INSERT INTO group_orders (id, code, admin_key_hash, name, organizer_name, organizer_phone, organizer_email, design_json, delivery_speed_id, deadline, status, settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).run(
    newId(),
    code,
    hashSecret(adminKey),
    input.name,
    input.organizer.name,
    phone,
    input.organizer.email ?? "",
    JSON.stringify(design),
    input.deliverySpeedId,
    input.deadline,
    JSON.stringify(settings),
    stamp,
    stamp,
  );
  return { code, adminKey };
}

/* ---------- Members ---------- */

interface CheckOptions {
  /** Organizer edits skip the class list, phone requirement and open/closed rules. */
  byOrganizer: boolean;
  /** Member being edited (excluded from duplicate checks). */
  excludeId?: string;
}

function checkMember(row: GroupRow, input: MemberInput, existing: MemberRow[], opts: CheckOptions): { name: string; nameKey: string; phone: string; number: string; sizeId: string; quantity: number } {
  const settings = JSON.parse(row.settings_json) as GroupSettings;
  const design = JSON.parse(row.design_json) as DesignSelection;
  const name = input.name.trim().replace(/\s+/g, " ");
  const nameKey = normalizeName(name);
  if (nameKey.length < 2) throw new GroupError("invalid", 400, ["name"]);

  let phone = "";
  if (input.phone?.trim()) {
    const p = normalizePhone(input.phone);
    if (!p) throw new GroupError("invalid", 400, ["phone"]);
    phone = p;
  } else if (!opts.byOrganizer) {
    throw new GroupError("invalid", 400, ["phone"]);
  }

  const number = (input.number ?? "").trim();
  if (design.personalization.numbers && !/^\d{1,3}$/.test(number)) throw new GroupError("invalid", 400, ["number"]);
  if (!settings.allowedSizes.includes(input.sizeId)) throw new GroupError("invalid", 400, ["sizeId"]);
  const quantity = settings.allowQuantity ? Math.min(Math.max(1, input.quantity ?? 1), 10) : 1;

  if (!opts.byOrganizer && !onNameList(name, settings.allowedNames)) throw new GroupError("notOnList", 403);

  const others = existing.filter((m) => m.id !== opts.excludeId);
  if (others.some((m) => m.name_key === nameKey)) throw new GroupError("duplicateName", 409);
  if (phone && others.some((m) => m.phone === phone)) throw new GroupError("duplicatePhone", 409);
  if (settings.maxPieces && others.reduce((s, m) => s + m.quantity, 0) + quantity > settings.maxPieces) throw new GroupError("full", 409);

  return { name, nameKey, phone, number: design.personalization.numbers ? number : "", sizeId: input.sizeId, quantity };
}

function requireOpen(row: GroupRow, now: Date) {
  if (row.status !== "open") throw new GroupError("closed", 409);
  if (!beforeDeadline(row.deadline, now)) throw new GroupError("pastDeadline", 409);
}

export function joinGroup(code: string, input: MemberInput, now = new Date()): { member: GroupMember; editKey: string } {
  const row = groupRow(code);
  requireOpen(row, now);
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const checked = checkMember(row, input, memberRows(row.id), { byOrganizer: false });
    const editKey = newSecret();
    const id = newId();
    const stamp = now.toISOString();
    db.prepare(
      `INSERT INTO group_members (id, group_id, edit_key_hash, name, name_key, phone, number, size_id, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, row.id, hashSecret(editKey), checked.name, checked.nameKey, checked.phone, checked.number, checked.sizeId, checked.quantity, stamp, stamp);
    db.exec("COMMIT");
    const member = toMember(db.prepare("SELECT * FROM group_members WHERE id = ?").get(id) as unknown as MemberRow);
    return { member, editKey };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** A member (with their own key) or the organizer (with the admin key) can read and change an entry. */
function authorizeMember(row: GroupRow, memberId: string, key: string | null): { member: MemberRow; byOrganizer: boolean } {
  const member = getDb().prepare("SELECT * FROM group_members WHERE id = ? AND group_id = ?").get(memberId, row.id) as MemberRow | undefined;
  if (!member) throw new GroupError("notFound", 404);
  if (secretMatches(key, row.admin_key_hash)) return { member, byOrganizer: true };
  if (secretMatches(key, member.edit_key_hash)) return { member, byOrganizer: false };
  throw new GroupError("unauthorized", 401);
}

export function getMember(code: string, memberId: string, key: string | null): GroupMember {
  const row = groupRow(code);
  return toMember(authorizeMember(row, memberId, key).member);
}

export function updateMember(code: string, memberId: string, key: string | null, patch: Partial<MemberInput>, now = new Date()): GroupMember {
  const row = groupRow(code);
  const { member, byOrganizer } = authorizeMember(row, memberId, key);
  if (!byOrganizer) requireOpen(row, now);
  const merged: MemberInput = {
    name: patch.name ?? member.name,
    phone: patch.phone ?? member.phone,
    number: patch.number ?? member.number,
    sizeId: patch.sizeId ?? member.size_id,
    quantity: patch.quantity ?? member.quantity,
  };
  const checked = checkMember(row, merged, memberRows(row.id), { byOrganizer, excludeId: member.id });
  getDb()
    .prepare("UPDATE group_members SET name = ?, name_key = ?, phone = ?, number = ?, size_id = ?, quantity = ?, updated_at = ? WHERE id = ?")
    .run(checked.name, checked.nameKey, checked.phone, checked.number, checked.sizeId, checked.quantity, now.toISOString(), member.id);
  return getMember(code, memberId, key);
}

export function deleteMember(code: string, memberId: string, key: string | null, now = new Date()): void {
  const row = groupRow(code);
  const { member, byOrganizer } = authorizeMember(row, memberId, key);
  if (!byOrganizer) requireOpen(row, now);
  getDb().prepare("DELETE FROM group_members WHERE id = ?").run(member.id);
}

/** Organizer adds people (e.g. pasted from a spreadsheet). Skips duplicates instead of failing the whole batch. */
export function addMembersAsOrganizer(code: string, adminKey: string | null, inputs: MemberInput[], now = new Date()): { added: number; skipped: { name: string; reason: GroupErrorCode }[] } {
  const row = requireAdmin(code, adminKey);
  const db = getDb();
  const skipped: { name: string; reason: GroupErrorCode }[] = [];
  let added = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const input of inputs) {
      try {
        const checked = checkMember(row, input, memberRows(row.id), { byOrganizer: true });
        const stamp = now.toISOString();
        db.prepare(
          `INSERT INTO group_members (id, group_id, edit_key_hash, name, name_key, phone, number, size_id, quantity, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(newId(), row.id, hashSecret(newSecret()), checked.name, checked.nameKey, checked.phone, checked.number, checked.sizeId, checked.quantity, stamp, stamp);
        added++;
      } catch (e) {
        if (e instanceof GroupError) skipped.push({ name: input.name, reason: e.code });
        else throw e;
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { added, skipped };
}

/* ---------- Organizer settings ---------- */

export function updateGroup(code: string, adminKey: string | null, patch: GroupPatch, now = new Date()): AdminGroup {
  const row = requireAdmin(code, adminKey);
  const catalog = getLiveCatalog();
  const settings = JSON.parse(row.settings_json) as GroupSettings;
  const next: GroupSettings = { ...settings };
  if (patch.settings?.allowedSizes) {
    const sizes = patch.settings.allowedSizes.filter((s) => catalog.sizes.some((c) => c.id === s));
    if (!sizes.length) throw new GroupError("invalid", 400, ["settings.allowedSizes"]);
    next.allowedSizes = sizes;
  }
  if (patch.settings?.allowQuantity !== undefined) next.allowQuantity = patch.settings.allowQuantity;
  if (patch.settings && "maxPieces" in patch.settings) {
    if (patch.settings.maxPieces) next.maxPieces = patch.settings.maxPieces;
    else delete next.maxPieces;
  }
  if (patch.settings && "allowedNames" in patch.settings) {
    if (patch.settings.allowedNames?.length) next.allowedNames = patch.settings.allowedNames;
    else delete next.allowedNames;
  }
  if (patch.deadline && (patch.deadline < cairoToday(now) || daysLeft(patch.deadline, now) > MAX_DEADLINE_DAYS)) {
    throw new GroupError("invalid", 400, ["deadline"]);
  }
  getDb()
    .prepare("UPDATE group_orders SET name = ?, deadline = ?, status = ?, settings_json = ?, updated_at = ? WHERE id = ?")
    .run(patch.name ?? row.name, patch.deadline ?? row.deadline, patch.status ?? row.status, JSON.stringify(next), now.toISOString(), row.id);
  return getAdminGroup(code, adminKey, now);
}
