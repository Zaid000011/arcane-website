import type { Catalog } from "@/lib/catalog/types";
import { newElementId } from "@/lib/design/types";
import type { PersonalizationSelection } from "@/lib/pricing/types";
import type { OrderDraft, RosterEntry } from "./types";

/** Names or numbers need one row per piece instead of a plain size count. */
export function needsRoster(p: PersonalizationSelection): boolean {
  return p.names || p.numbers;
}

/** Pieces per size that the price is calculated from. */
export function effectiveSizes(order: OrderDraft, p: PersonalizationSelection): Record<string, number> {
  if (!needsRoster(p)) return order.sizes;
  const out: Record<string, number> = {};
  for (const row of order.roster) if (row.sizeId) out[row.sizeId] = (out[row.sizeId] ?? 0) + 1;
  return out;
}

export function totalPieces(sizes: Record<string, number>): number {
  return Object.values(sizes).reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0), 0);
}

const SIZE_ALIASES: Record<string, string> = {
  XXS: "XS",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  XLARGE: "XL",
  "X-LARGE": "XL",
  XXL: "2XL",
  "2X": "2XL",
  XXXL: "3XL",
  "3X": "3XL",
};

/** Matches a size written any common way ("xxl", "2XL", "Large") to a catalog size id. */
export function normalizeSize(token: string, catalog: Catalog): string | null {
  const t = token.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return null;
  const want = SIZE_ALIASES[t] ?? t;
  return catalog.sizes.find((s) => s.id.toUpperCase() === want || s.label.toUpperCase() === want)?.id ?? null;
}

const NUMBER_RE = /^#?\d{1,3}$/;

/**
 * Turns pasted text into roster rows. Accepts one person per line, with name,
 * size and number in any order, separated by tabs (Excel/Sheets), commas,
 * semicolons, dashes or just spaces: "Mariam Hassan, M, 7" · "Omar Adel L 10".
 */
export function parseRosterText(text: string, catalog: Catalog): RosterEntry[] {
  const rows: RosterEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    // Skip header rows such as "Name, Size, Number".
    if ((lower.includes("name") && lower.includes("size")) || (line.includes("الاسم") && line.includes("المقاس"))) continue;

    const parts = line.split(/\t|,|;|\||\s[-–]\s/).map((p) => p.trim()).filter(Boolean);
    let sizeId = "";
    let number = "";
    const nameParts: string[] = [];
    for (const part of parts) {
      const size = !sizeId ? normalizeSize(part, catalog) : null;
      if (size) {
        sizeId = size;
        continue;
      }
      if (!number && NUMBER_RE.test(part)) {
        number = part.replace("#", "");
        continue;
      }
      nameParts.push(part);
    }

    // Space-separated lines: look for a size or number word at the end.
    let name = nameParts.join(" ");
    if (name && (!sizeId || !number)) {
      const words = name.split(/\s+/);
      while (words.length > 1) {
        const last = words[words.length - 1]!;
        const size = !sizeId ? normalizeSize(last, catalog) : null;
        if (size) {
          sizeId = size;
          words.pop();
        } else if (!number && NUMBER_RE.test(last)) {
          number = last.replace("#", "");
          words.pop();
        } else break;
      }
      name = words.join(" ");
    }

    if (!name && !number && !sizeId) continue;
    rows.push({ id: newElementId(), name: name.slice(0, 40), number, sizeId });
  }
  return rows;
}

/** The class names list: one per line or separated by commas. */
export function parseNamesList(text: string): string[] {
  return text
    .split(/\r?\n|,|،/)
    .map((n) => n.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((n) => n.slice(0, 40));
}
