import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { closestColor, normalizeHex } from "@/lib/color-match";
import { seedCatalog } from "@/lib/catalog/seed";
import { customRequestSchema, type CustomRequestInput } from "@/lib/validation";
import { dataDir, useMemoryDb } from "./db";
import { ApiFailure } from "./errors";
import { safeFileName, sniffRequestFile } from "./request-files";
import { countNewRequests, createRequest, getRequest, listRequests, readRequestFileForTeam, updateRequest } from "./requests";

process.env.ARCANE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "arcane-requests-"));

const NOW = new Date(Date.UTC(2026, 10, 24, 9, 0));
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n1 0 obj\n", "latin1");
const PSD = Buffer.concat([Buffer.from("8BPS", "latin1"), Buffer.alloc(22)]);
const EXE = Buffer.from("4d5a90000300000004000000ffff0000", "hex");

function input(over: Partial<CustomRequestInput> & Record<string, unknown> = {}): CustomRequestInput {
  return customRequestSchema.parse({ kind: "design", locale: "en", name: "Mariam Hassan", phone: "010 1234 5678", productId: "hoodie", ...over });
}

function failure(fn: () => unknown): ApiFailure {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiFailure) return e;
    throw e;
  }
  throw new Error("expected a failure");
}

beforeEach(() => {
  useMemoryDb();
});

describe("send it to us requests", () => {
  it("saves a design with its files and shows it to the team as new", () => {
    const { code } = createRequest(input({ quantity: 40, message: "Gold on black, front and back" }), [
      { name: "logo.png", data: PNG },
      { name: "class-2027.ai", data: PDF },
    ], NOW);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const r = getRequest(code);
    expect(r).toMatchObject({ kind: "design", status: "new", name: "Mariam Hassan", phone: "01012345678", productId: "hoodie", quantity: 40 });
    expect(r.files.map((f) => [f.name, f.type])).toEqual([
      ["logo.png", "image/png"],
      ["class-2027.ai", "application/pdf"],
    ]);
    expect(readRequestFileForTeam(code, r.files[0]!.id).data.equals(PNG)).toBe(true);
    expect(countNewRequests()).toBe(1);
  });

  it("needs a file for a design, a valid phone and only known file types", () => {
    expect(failure(() => createRequest(input(), [], NOW)).details).toEqual(["files"]);
    expect(failure(() => createRequest(input({ phone: "12345" }), [{ name: "a.png", data: PNG }], NOW)).details).toEqual(["phone"]);
    expect(failure(() => createRequest(input(), [{ name: "setup.png", data: EXE }], NOW)).code).toBe("badType");
    expect(failure(() => createRequest(input(), Array.from({ length: 6 }, () => ({ name: "a.png", data: PNG })), NOW)).details).toEqual(["files"]);
    expect(listRequests({ view: "all" }).total).toBe(0);
  });

  it("takes only photos with a color request, and keeps the color code", () => {
    expect(failure(() => createRequest(input({ kind: "color", color: { hex: "#0f4c81", name: "" } }), [{ name: "swatch.psd", data: PSD }], NOW)).code).toBe("badType");
    const { code } = createRequest(input({ kind: "color", color: { hex: "#0f4c81", name: "School blue" } }), [{ name: "swatch.png", data: PNG }], NOW);
    expect(getRequest(code).color).toEqual({ hex: "#0F4C81", name: "School blue" });
  });

  it("keeps custom size measurements and refuses sizes without them", () => {
    expect(() => input({ kind: "size" })).toThrow();
    expect(() => input({ kind: "size", size: { chest: 5, length: 70, count: 1 } })).toThrow();
    const { code } = createRequest(input({ kind: "size", size: { chest: 66.25, length: 80, sleeve: 64, count: 2 } }), [], NOW);
    expect(getRequest(code).size).toEqual({ chest: 66.3, length: 80, sleeve: 64, count: 2 });
  });

  it("forgets a garment that isn't on sale", () => {
    const { code } = createRequest(input({ productId: "spaceSuit" }), [{ name: "a.png", data: PNG }], NOW);
    expect(getRequest(code).productId).toBe("");
  });

  it("lets the team mark requests and keep a note", () => {
    const a = createRequest(input(), [{ name: "a.png", data: PNG }], NOW).code;
    const b = createRequest(input({ kind: "size", size: { chest: 60, length: 75, count: 1 } }), [], NOW).code;
    updateRequest(a, { status: "contacted", teamNote: "  Sent price on WhatsApp " }, "Omar", NOW);
    expect(getRequest(a)).toMatchObject({ status: "contacted", teamNote: "Sent price on WhatsApp", updatedBy: "Omar" });

    const lists = listRequests({ view: "new" });
    expect(lists.rows.map((r) => r.code)).toEqual([b]);
    expect(lists.counts).toEqual({ new: 1, contacted: 1, done: 0 });
    expect(listRequests({ view: "all" }).total).toBe(2);
    expect(failure(() => updateRequest("NOPE00", { status: "done" }, "Omar")).code).toBe("notFound");
  });

  it("stores files only inside the request's own folder", () => {
    const { code } = createRequest(input(), [{ name: "../../etc/passwd.png", data: PNG }], NOW);
    const r = getRequest(code);
    expect(r.files[0]!.name).toBe(".._.._etc_passwd.png");
    expect(fs.readdirSync(path.join(dataDir(), "requests")).length).toBeGreaterThan(0);
  });
});

describe("file checks", () => {
  it("recognizes design files by their content, not their name", () => {
    expect(sniffRequestFile(PNG)).toBe("image/png");
    expect(sniffRequestFile(PDF)).toBe("application/pdf");
    expect(sniffRequestFile(PSD)).toBe("image/vnd.adobe.photoshop");
    expect(sniffRequestFile(Buffer.from("%!PS-Adobe-3.0 EPSF-3.0", "latin1"))).toBe("application/postscript");
    expect(sniffRequestFile(EXE)).toBeNull();
  });

  it("makes file names safe", () => {
    expect(safeFileName('my "logo":v2?.png')).toBe("my _logo__v2_.png");
    expect(safeFileName("   ")).toBe("file");
    expect(safeFileName(`${"a".repeat(200)}.png`).length).toBe(120);
  });
});

describe("closest garment color", () => {
  it("finds the nearest in-stock color", () => {
    expect(normalizeHex("1c2541")).toBe("#1C2541");
    expect(normalizeHex("#fff")).toBe("#FFFFFF");
    expect(normalizeHex("blue")).toBeNull();
    expect(closestColor("#1D2643", seedCatalog.colors)?.color.id).toBe("navy");
    expect(closestColor("#FEFEFE", seedCatalog.colors)?.color.id).toBe("white");
    const noNavy = seedCatalog.colors.map((c) => (c.id === "navy" ? { ...c, inStock: false } : c));
    expect(closestColor("#1C2541", noNavy)?.color.id).not.toBe("navy");
  });
});
