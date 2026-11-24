import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AdminUser, Role } from "@/lib/admin/roles";
import { getDb } from "./db";
import { ApiFailure } from "./errors";
import { newId } from "./tokens";

/**
 * Team logins. Passwords are stored as salted scrypt hashes; sessions are
 * random tokens kept in a cookie, stored hashed so a copy of the database
 * can't be used to sign in.
 */

export const SESSION_COOKIE = "arcane_admin";
export const SESSION_DAYS = 30;

export type AuthErrorCode = "unauthorized" | "forbidden" | "invalid" | "taken" | "lastOwner" | "wrongPassword" | "setupDone" | "notFound";

export class AuthError extends ApiFailure {
  declare code: AuthErrorCode;
  constructor(code: AuthErrorCode, status: number, details?: unknown) {
    super(code, status, details);
  }
}

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: Role;
  password_hash: string;
  active: number;
  created_at: string;
  updated_at: string;
}

const SCRYPT = { N: 16384, r: 8, p: 1 };
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Checked when a username doesn't exist, so a wrong username takes as long as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(12).toString("hex"));

function toUser(r: UserRow): AdminUser {
  return { id: r.id, username: r.username, name: r.name, role: r.role, active: r.active === 1, createdAt: r.created_at };
}

function cleanUsername(username: string): string {
  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) throw new AuthError("invalid", 400, ["username"]);
  return u;
}

function checkPassword(password: string) {
  if (password.length < 8 || password.length > 200) throw new AuthError("invalid", 400, ["password"]);
}

function checkName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) throw new AuthError("invalid", 400, ["name"]);
  return n;
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/* ---------- Setup and sign-in ---------- */

export function hasUsers(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM admin_users LIMIT 1").get());
}

/** Creates the first owner. Only works while there are no logins at all. */
export function createFirstOwner(input: { name: string; username: string; password: string }, now = new Date()): AdminUser {
  if (hasUsers()) throw new AuthError("setupDone", 409);
  return insertUser({ ...input, role: "owner" }, now);
}

function insertUser(input: { name: string; username: string; password: string; role: Role }, now: Date): AdminUser {
  const username = cleanUsername(input.username);
  const name = checkName(input.name);
  checkPassword(input.password);
  const db = getDb();
  if (db.prepare("SELECT 1 FROM admin_users WHERE username = ?").get(username)) throw new AuthError("taken", 409);
  const id = newId();
  const stamp = now.toISOString();
  db.prepare("INSERT INTO admin_users (id, username, name, role, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").run(
    id,
    username,
    name,
    input.role,
    hashPassword(input.password),
    stamp,
    stamp,
  );
  return getUser(id);
}

/** Checks a username and password and starts a session. The returned token goes in the cookie. */
export function login(username: string, password: string, now = new Date()): { token: string; user: AdminUser } {
  const row = getDb().prepare("SELECT * FROM admin_users WHERE username = ?").get(username.trim().toLowerCase()) as UserRow | undefined;
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || row.active !== 1) throw new AuthError("unauthorized", 401);
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  getDb().prepare("INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenHash(token), row.id, now.toISOString(), expires.toISOString());
  return { token, user: toUser(row) };
}

/** The signed-in person for a session token, or null if it's missing, expired or the login was turned off. */
export function sessionUser(token: string | null | undefined, now = new Date()): AdminUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare("SELECT u.*, s.expires_at AS session_expires FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .get(tokenHash(token)) as (UserRow & { session_expires: string }) | undefined;
  if (!row) return null;
  if (row.session_expires <= now.toISOString() || row.active !== 1) {
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(token));
    return null;
  }
  return toUser(row);
}

export function logout(token: string | null | undefined): void {
  if (token) getDb().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(token));
}

/* ---------- Team management (owner only; the routes check that) ---------- */

export function getUser(id: string): AdminUser {
  const row = getDb().prepare("SELECT * FROM admin_users WHERE id = ?").get(id) as UserRow | undefined;
  if (!row) throw new AuthError("notFound", 404);
  return toUser(row);
}

export function listUsers(): AdminUser[] {
  return (getDb().prepare("SELECT * FROM admin_users ORDER BY active DESC, created_at").all() as unknown as UserRow[]).map(toUser);
}

export function createUser(input: { name: string; username: string; password: string; role: Role }, now = new Date()): AdminUser {
  return insertUser(input, now);
}

/** Changes someone's name, role, access or password. The last active owner can't be removed or demoted. */
export function updateUser(id: string, patch: { name?: string; role?: Role; active?: boolean; password?: string }, now = new Date()): AdminUser {
  const db = getDb();
  const user = getUser(id);
  const losesOwner = user.role === "owner" && user.active && ((patch.role && patch.role !== "owner") || patch.active === false);
  if (losesOwner) {
    const owners = (db.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND active = 1").get() as { n: number }).n;
    if (Number(owners) <= 1) throw new AuthError("lastOwner", 409);
  }
  const name = patch.name !== undefined ? checkName(patch.name) : user.name;
  if (patch.password !== undefined) checkPassword(patch.password);
  db.prepare("UPDATE admin_users SET name = ?, role = ?, active = ?, password_hash = COALESCE(?, password_hash), updated_at = ? WHERE id = ?").run(
    name,
    patch.role ?? user.role,
    (patch.active ?? user.active) ? 1 : 0,
    patch.password !== undefined ? hashPassword(patch.password) : null,
    now.toISOString(),
    id,
  );
  // A new password or turned-off access signs them out everywhere.
  if (patch.password !== undefined || patch.active === false) db.prepare("DELETE FROM admin_sessions WHERE user_id = ?").run(id);
  return getUser(id);
}

/** Someone changes their own password; other devices are signed out, this one stays signed in. */
export function changeOwnPassword(id: string, current: string, next: string, keepToken: string | null, now = new Date()): void {
  const row = getDb().prepare("SELECT * FROM admin_users WHERE id = ?").get(id) as UserRow | undefined;
  if (!row || !verifyPassword(current, row.password_hash)) throw new AuthError("wrongPassword", 400);
  checkPassword(next);
  const db = getDb();
  db.prepare("UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(next), now.toISOString(), id);
  db.prepare("DELETE FROM admin_sessions WHERE user_id = ? AND token_hash != ?").run(id, keepToken ? tokenHash(keepToken) : "");
}
