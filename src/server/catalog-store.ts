import type { DatabaseSync } from "node:sqlite";
import { applyPriceSheet, priceSheetOf, priceSheetProblems, type PriceSheet } from "@/lib/catalog/price-sheet";
import { seedCatalog } from "@/lib/catalog/seed";
import type { Catalog } from "@/lib/catalog/types";
import { getDb } from "./db";
import { ApiFailure } from "./errors";

/**
 * The live catalog: the built-in catalog with the latest saved prices on top.
 * Every page and the checkout read it from here, so a saved change shows up
 * straight away. Orders already placed keep the prices they were charged.
 */

export interface CatalogVersion {
  id: number;
  author: string;
  note: string;
  createdAt: string;
}

const memo = globalThis as unknown as { __arcaneCatalog?: { db: DatabaseSync; catalog: Catalog; versionId: number | null } };

export function getLiveCatalog(): Catalog {
  const db = getDb();
  const cached = memo.__arcaneCatalog;
  if (cached && cached.db === db) return cached.catalog;
  const row = db.prepare("SELECT id, sheet_json FROM catalog_versions ORDER BY id DESC LIMIT 1").get() as { id: number; sheet_json: string } | undefined;
  let catalog = seedCatalog;
  if (row) {
    try {
      catalog = { ...applyPriceSheet(seedCatalog, JSON.parse(row.sheet_json) as PriceSheet), version: Number(row.id) };
    } catch (e) {
      // A broken saved version must never take the shop down: fall back to the built-in prices.
      console.error("Couldn't load saved prices, using the built-in ones", e);
    }
  }
  memo.__arcaneCatalog = { db, catalog, versionId: row ? Number(row.id) : null };
  return catalog;
}

export function catalogVersions(limit = 15): CatalogVersion[] {
  return (getDb().prepare("SELECT id, author, note, created_at FROM catalog_versions ORDER BY id DESC LIMIT ?").all(limit) as unknown as {
    id: number;
    author: string;
    note: string;
    created_at: string;
  }[]).map((r) => ({ id: Number(r.id), author: r.author, note: r.note, createdAt: r.created_at }));
}

function insertVersion(sheet: PriceSheet, author: string, note: string, now: Date): CatalogVersion {
  const result = getDb().prepare("INSERT INTO catalog_versions (sheet_json, note, author, created_at) VALUES (?, ?, ?, ?)").run(JSON.stringify(sheet), note, author, now.toISOString());
  delete memo.__arcaneCatalog;
  return { id: Number(result.lastInsertRowid), author, note, createdAt: now.toISOString() };
}

/** Saves edited prices as a new version. */
export function savePriceSheet(sheet: PriceSheet, author: string, now = new Date()): CatalogVersion {
  const next = applyPriceSheet(seedCatalog, sheet);
  const problems = priceSheetProblems(next);
  if (problems.length) throw new ApiFailure("invalid", 400, problems);
  return insertVersion(priceSheetOf(next), author, "", now);
}

/** Brings back an earlier version (or the original built-in prices) as a new version, so nothing is lost. */
export function restoreVersion(id: number | "original", author: string, now = new Date()): CatalogVersion {
  if (id === "original") return insertVersion(priceSheetOf(seedCatalog), author, "Original prices", now);
  const row = getDb().prepare("SELECT sheet_json FROM catalog_versions WHERE id = ?").get(id) as { sheet_json: string } | undefined;
  if (!row) throw new ApiFailure("notFound", 404);
  return insertVersion(JSON.parse(row.sheet_json) as PriceSheet, author, `Restored version ${id}`, now);
}
