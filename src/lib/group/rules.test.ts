import { describe, expect, it } from "vitest";
import { addDays, beforeDeadline, cairoToday, daysLeft, normalizeName, normalizePhone, onNameList } from "./rules";

describe("deadlines in Cairo time", () => {
  // 22:30 UTC on 23 Nov is already 24 Nov in Cairo (UTC+2).
  const lateNight = new Date(Date.UTC(2026, 10, 23, 22, 30));

  it("uses the Cairo date", () => {
    expect(cairoToday(lateNight)).toBe("2026-11-24");
  });

  it("stays open through the whole deadline day", () => {
    expect(beforeDeadline("2026-11-24", lateNight)).toBe(true);
    expect(beforeDeadline("2026-11-23", lateNight)).toBe(false);
  });

  it("counts days left", () => {
    expect(daysLeft("2026-11-30", lateNight)).toBe(6);
    expect(daysLeft("2026-11-24", lateNight)).toBe(0);
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
  });
});

describe("names", () => {
  it("matches names loosely in English and Arabic", () => {
    expect(normalizeName("  Mariam   HASSAN ")).toBe("mariam hassan");
    expect(normalizeName("أحمد علي")).toBe(normalizeName("احمد على"));
    expect(normalizeName("سارة")).toBe(normalizeName("ساره"));
  });

  it("checks the class list", () => {
    expect(onNameList("mariam hassan", ["Mariam Hassan", "Omar Adel"])).toBe(true);
    expect(onNameList("Nour", ["Mariam Hassan"])).toBe(false);
    expect(onNameList("Anyone", undefined)).toBe(true);
  });
});

describe("phone numbers", () => {
  it("accepts Egyptian mobile numbers in common formats", () => {
    expect(normalizePhone("010 1234 5678")).toBe("01012345678");
    expect(normalizePhone("+20 112 345 6789")).toBe("01123456789");
    expect(normalizePhone("0020 1223456789")).toBe("01223456789");
    expect(normalizePhone("٠١٥٥٥١٢٣٤٥٦")).toBe("01555123456");
  });

  it("rejects anything else", () => {
    expect(normalizePhone("0123")).toBeNull();
    expect(normalizePhone("01312345678")).toBeNull();
    expect(normalizePhone("hello")).toBeNull();
  });
});
