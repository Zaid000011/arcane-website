import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { defaultDesign, switchProduct } from "@/lib/design/logic";
import { namesGrid, togglePersonal } from "@/lib/design/personalization";
import type { DesignSelection } from "@/lib/pricing/types";
import { addWorkingDays, isWorkingDay } from "./dates";
import { effectiveSizes, normalizeSize, parseNamesList, parseRosterText, totalPieces } from "./roster";
import { emptyOrder, type OrderDraft } from "./types";
import { orderIssues } from "./validate";

const cal = seedCatalog.calendar;
const hoodie = seedCatalog.products.find((p) => p.id === "hoodie")!;
const strip = (rows: ReturnType<typeof parseRosterText>) => rows.map(({ name, number, sizeId }) => ({ name, number, sizeId }));

describe("pasting a roster", () => {
  it("reads comma, tab and space separated lines in any order", () => {
    const rows = parseRosterText("Name, Size, Number\nMariam Hassan, M, 7\nOmar Adel\tL\t10\nYoussef Samir xxl #23\n\n8, s, Nour", seedCatalog);
    expect(strip(rows)).toEqual([
      { name: "Mariam Hassan", number: "7", sizeId: "M" },
      { name: "Omar Adel", number: "10", sizeId: "L" },
      { name: "Youssef Samir", number: "23", sizeId: "2XL" },
      { name: "Nour", number: "8", sizeId: "S" },
    ]);
  });

  it("keeps Arabic names and leaves the size empty when it's missing", () => {
    expect(strip(parseRosterText("مريم حسن\nعمر عادل - L", seedCatalog))).toEqual([
      { name: "مريم حسن", number: "", sizeId: "" },
      { name: "عمر عادل", number: "", sizeId: "L" },
    ]);
  });

  it("understands common size spellings", () => {
    expect(normalizeSize("xxxl", seedCatalog)).toBe("3XL");
    expect(normalizeSize("Large", seedCatalog)).toBe("L");
    expect(normalizeSize("2xl", seedCatalog)).toBe("2XL");
    expect(normalizeSize("huge", seedCatalog)).toBeNull();
  });

  it("splits a class list by lines and commas", () => {
    expect(parseNamesList("Mariam, Omar\n  Nour  Ali \n\nسارة، ياسين")).toEqual(["Mariam", "Omar", "Nour Ali", "سارة", "ياسين"]);
  });
});

describe("quantities", () => {
  const roster: OrderDraft = {
    ...emptyOrder(),
    sizes: { M: 50 },
    roster: [
      { id: "1", name: "A", number: "1", sizeId: "M" },
      { id: "2", name: "B", number: "2", sizeId: "M" },
      { id: "3", name: "C", number: "3", sizeId: "XL" },
    ],
  };

  it("uses the size counts when nothing is personalized per piece", () => {
    expect(effectiveSizes(roster, defaultDesign(seedCatalog, "hoodie").personalization)).toEqual({ M: 50 });
  });

  it("counts the roster when names or numbers are on", () => {
    const d = togglePersonal(hoodie, defaultDesign(seedCatalog, "hoodie"), "name", true, "#fff");
    expect(effectiveSizes(roster, d.personalization)).toEqual({ M: 2, XL: 1 });
    expect(totalPieces({ M: 2, XL: 1, L: -4 })).toBe(3);
  });
});

describe("order checks", () => {
  const withNames = (): DesignSelection => {
    let d = defaultDesign(seedCatalog, "hoodie");
    d = togglePersonal(hoodie, d, "name", true, "#fff");
    return togglePersonal(hoodie, d, "number", true, "#fff");
  };

  it("needs at least one piece", () => {
    expect(orderIssues(defaultDesign(seedCatalog, "hoodie"), emptyOrder())).toEqual([{ code: "noPieces", severity: "error" }]);
  });

  it("flags missing names, numbers and sizes and repeated numbers", () => {
    const order: OrderDraft = {
      ...emptyOrder(),
      roster: [
        { id: "1", name: "Mariam", number: "7", sizeId: "M" },
        { id: "2", name: "", number: "7", sizeId: "" },
        { id: "3", name: "Omar", number: "", sizeId: "L" },
      ],
    };
    expect(orderIssues(withNames(), order)).toEqual([
      { code: "rosterMissingSize", severity: "error", params: { count: 1 } },
      { code: "rosterMissingName", severity: "error", params: { count: 1 } },
      { code: "rosterMissingNumber", severity: "error", params: { count: 1 } },
      { code: "rosterDuplicateNumber", severity: "warning", params: { numbers: "7" } },
    ]);
  });

  it("needs names for the class list", () => {
    const d = togglePersonal(hoodie, defaultDesign(seedCatalog, "hoodie"), "namesList", true, "#fff");
    expect(orderIssues(d, { ...emptyOrder(), sizes: { M: 5 } })).toEqual([{ code: "namesListEmpty", severity: "error" }]);
  });
});

describe("personalization styles", () => {
  it("places names on the upper back and numbers on the full back by default", () => {
    let d = togglePersonal(hoodie, defaultDesign(seedCatalog, "hoodie"), "name", true, "#fff");
    d = togglePersonal(hoodie, d, "number", true, "#fff");
    expect(d.personalization.nameStyle?.areaId).toBe("backUpper");
    expect(d.personalization.numberStyle?.areaId).toBe("fullBack");
  });

  it("moves a placement the new product doesn't have", () => {
    let d = togglePersonal(hoodie, defaultDesign(seedCatalog, "hoodie"), "number", true, "#fff");
    d = { ...d, personalization: { ...d.personalization, numberStyle: { ...d.personalization.numberStyle!, areaId: "frontCenter" } } };
    const polo = switchProduct(seedCatalog, d, "polo");
    expect(polo.personalization.numberStyle?.areaId).toBe("fullBack");
  });

  it("fits the class list into a grid", () => {
    const names = Array.from({ length: 60 }, (_, i) => `Student ${i + 1}`);
    const grid = namesGrid(names, 300, 420);
    expect(grid.columns * grid.rows).toBeGreaterThanOrEqual(60);
    expect(grid.fontSize).toBeGreaterThan(5);
    expect(namesGrid([], 300, 420).rows).toBe(0);
  });
});

describe("working days", () => {
  it("skips Fridays and Saturdays", () => {
    // Thursday 26 Nov 2026 + 1 working day = Sunday 29 Nov.
    expect(addWorkingDays(new Date(2026, 10, 26), 1, cal).toDateString()).toBe(new Date(2026, 10, 29).toDateString());
    expect(isWorkingDay(new Date(2026, 10, 27), cal)).toBe(false);
  });

  it("skips national holidays", () => {
    // Wednesday 6 Jan 2027 + 1: 7 Jan is a holiday, then the weekend.
    expect(addWorkingDays(new Date(2027, 0, 6), 1, cal).toDateString()).toBe(new Date(2027, 0, 10).toDateString());
  });

  it("counts 14 working days for standard delivery", () => {
    // Monday 23 Nov 2026 + 14 working days = Sunday 13 Dec 2026.
    expect(addWorkingDays(new Date(2026, 10, 23), 14, cal).toDateString()).toBe(new Date(2026, 11, 13).toDateString());
  });
});
