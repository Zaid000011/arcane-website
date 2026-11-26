import { describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { daysOff, holidayList, workingRun } from "./working-days";

describe("working days in words", () => {
  it("say we're off Friday and Saturday and work Sunday to Thursday, in both languages", () => {
    expect(daysOff(seedCatalog, "en")).toBe("Friday and Saturday");
    expect(daysOff(seedCatalog, "ar")).toBe("الجمعة والسبت");
    expect(workingRun(seedCatalog, "en")).toEqual({ from: "Sunday", to: "Thursday" });
    expect(workingRun(seedCatalog, "ar")).toEqual({ from: "الأحد", to: "الخميس" });
  });

  it("follow the work calendar if it changes", () => {
    const fridayOnly = { ...seedCatalog, calendar: { ...seedCatalog.calendar, weekend: [5] } };
    expect(daysOff(fridayOnly, "en")).toBe("Friday");
    expect(workingRun(fridayOnly, "en")).toEqual({ from: "Saturday", to: "Thursday" });
  });

  it("list holidays in date order, dropping one-off dates that have passed", () => {
    const catalog = { ...seedCatalog, calendar: { ...seedCatalog.calendar, holidays: ["10-06", "2025-03-30", "2027-03-20", "01-07"] } };
    expect(holidayList(catalog, "en", new Date(2026, 10, 26))).toEqual(["7 January", "6 October", "20 March 2027"]);
  });
});
