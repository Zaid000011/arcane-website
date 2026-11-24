import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

/**
 * Local database for development: Node's built-in SQLite, stored in .data/.
 * In production this module is the one place to switch to a hosted
 * Postgres database (Supabase or Neon); the rest of the server code only
 * uses the functions in groups.ts and orders.ts.
 */

const cache = globalThis as unknown as { __arcaneDb?: DatabaseSync };

export function dataDir(): string {
  return process.env.ARCANE_DATA_DIR ?? path.join(process.cwd(), ".data");
}

function sqlite(): typeof import("node:sqlite") {
  // Loaded at runtime so the bundler doesn't try to package it.
  return process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
}

export function getDb(): DatabaseSync {
  if (cache.__arcaneDb) return cache.__arcaneDb;
  fs.mkdirSync(dataDir(), { recursive: true });
  const db = new (sqlite().DatabaseSync)(path.join(dataDir(), "arcane.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  migrate(db);
  cache.__arcaneDb = db;
  return db;
}

/** For tests: a fresh in-memory database. */
export function useMemoryDb(): DatabaseSync {
  const db = new (sqlite().DatabaseSync)(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  cache.__arcaneDb = db;
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS group_orders (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      admin_key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      organizer_name TEXT NOT NULL,
      organizer_phone TEXT NOT NULL,
      organizer_email TEXT NOT NULL DEFAULT '',
      design_json TEXT NOT NULL,
      delivery_speed_id TEXT NOT NULL,
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES group_orders(id) ON DELETE CASCADE,
      edit_key_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      number TEXT NOT NULL DEFAULT '',
      size_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS group_members_group ON group_members(group_id);

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      key_hash TEXT NOT NULL,
      request_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      upfront INTEGER NOT NULL,
      on_delivery INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL DEFAULT 0,
      items_total INTEGER NOT NULL,
      shipping_fee INTEGER NOT NULL,
      total INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      shipping_json TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      locale TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      design_json TEXT NOT NULL,
      order_json TEXT NOT NULL,
      quote_json TEXT NOT NULL,
      group_code TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id);
    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      file_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id);
    CREATE TABLE IF NOT EXISTS order_files (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS order_files_order ON order_files(order_id);

    CREATE TABLE IF NOT EXISTS order_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS order_notes_order ON order_notes(order_id);

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_user ON admin_sessions(user_id);

    CREATE TABLE IF NOT EXISTS catalog_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_json TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_requests (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      locale TEXT NOT NULL,
      product_id TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      team_note TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS custom_requests_status ON custom_requests(status, created_at);
    CREATE TABLE IF NOT EXISTS custom_request_files (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES custom_requests(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS custom_request_files_request ON custom_request_files(request_id);
  `);
  addColumn(db, "order_events", "actor", "TEXT NOT NULL DEFAULT ''");
}

/** Adds a column to an existing table once (SQLite has no ADD COLUMN IF NOT EXISTS). */
function addColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
