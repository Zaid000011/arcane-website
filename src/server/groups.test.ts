import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "@/lib/catalog/seed";
import { addElement, newImageElement } from "@/lib/design/elements";
import { defaultDesign, togglePrint } from "@/lib/design/logic";
import { togglePersonal } from "@/lib/design/personalization";
import type { CreateGroupInput } from "@/lib/validation";
import { createGroupSchema } from "@/lib/validation";
import { saveAsset, sniffType } from "./assets";
import { useMemoryDb } from "./db";
import {
  addMembersAsOrganizer,
  createGroup,
  deleteMember,
  getAdminGroup,
  getMember,
  getPublicGroup,
  GroupError,
  joinGroup,
  updateGroup,
  updateMember,
} from "./groups";

process.env.ARCANE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "arcane-test-"));

const NOW = new Date(Date.UTC(2026, 10, 23, 10, 0)); // 23 Nov 2026, noon in Cairo
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const hoodie = seedCatalog.products.find((p) => p.id === "hoodie")!;

function input(over: Partial<CreateGroupInput> = {}): CreateGroupInput {
  let design = defaultDesign(seedCatalog, "hoodie");
  design = togglePersonal(hoodie, design, "name", true, "#F5EBD8");
  return createGroupSchema.parse({
    name: "CS Seniors 2027",
    organizer: { name: "Mariam Hassan", phone: "010 1234 5678", email: "" },
    design,
    deliverySpeedId: "standard",
    deadline: "2026-11-30",
    settings: { allowedSizes: ["S", "M", "L", "XL"], allowQuantity: false },
    ...over,
  });
}

const code = (e: unknown) => (e instanceof GroupError ? e.code : String(e));
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return code(e);
  }
  return "no error";
};

beforeEach(() => {
  useMemoryDb();
});

describe("creating a group", () => {
  it("creates a group with a short code and a private organizer key", () => {
    const { code: c, adminKey } = createGroup(input(), NOW);
    expect(c).toMatch(/^[A-Z2-9]{6}$/);
    expect(adminKey.length).toBeGreaterThan(20);
    const pub = getPublicGroup(c, NOW)!;
    expect(pub).toMatchObject({ name: "CS Seniors 2027", organizerFirstName: "Mariam", memberCount: 0, isOpen: true, status: "open" });
    expect(JSON.stringify(pub)).not.toContain("01012345678");
  });

  it("needs uploaded artwork to exist on the server", () => {
    let design = togglePrint(seedCatalog, defaultDesign(seedCatalog, "hoodie"), "frontCenter");
    const img = newImageElement({ w: 210, h: 300 }, { assetId: "test-asset-0001", name: "logo.png", pxW: 3000, pxH: 3000, vector: false });
    design = addElement(seedCatalog, design, "frontCenter", img);
    expect(fails(() => createGroup(input({ design }), NOW))).toBe("missingAssets");
    expect(saveAsset("test-asset-0001", PNG)).toBe("saved");
    expect(createGroup(input({ design }), NOW).code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("rejects past deadlines and bad phone numbers", () => {
    expect(fails(() => createGroup(input({ deadline: "2026-11-01" }), NOW))).toBe("invalid");
    expect(fails(() => createGroup(input({ organizer: { name: "Mariam", phone: "123", email: "" } }), NOW))).toBe("invalid");
  });
});

describe("joining", () => {
  it("lets people join once, with matching names and phones treated as duplicates", () => {
    const { code: c } = createGroup(input(), NOW);
    const { member, editKey } = joinGroup(c, { name: "Omar Adel", phone: "01122223333", sizeId: "L" }, NOW);
    expect(member).toMatchObject({ name: "Omar Adel", phone: "01122223333", sizeId: "L", quantity: 1 });
    expect(editKey.length).toBeGreaterThan(20);
    expect(fails(() => joinGroup(c, { name: "  omar   ADEL ", phone: "01099998888", sizeId: "M" }, NOW))).toBe("duplicateName");
    expect(fails(() => joinGroup(c, { name: "Someone Else", phone: "+20 112 222 3333", sizeId: "M" }, NOW))).toBe("duplicatePhone");
    expect(getPublicGroup(c, NOW)!.memberCount).toBe(1);
  });

  it("checks sizes, phones and numbers", () => {
    let design = togglePersonal(hoodie, defaultDesign(seedCatalog, "hoodie"), "number", true, "#FFFFFF");
    design = togglePersonal(hoodie, design, "name", true, "#FFFFFF");
    const { code: c } = createGroup(input({ design }), NOW);
    expect(fails(() => joinGroup(c, { name: "Nour Ali", phone: "01011112222", sizeId: "3XL", number: "7" }, NOW))).toBe("invalid");
    expect(fails(() => joinGroup(c, { name: "Nour Ali", phone: "12", sizeId: "M", number: "7" }, NOW))).toBe("invalid");
    expect(fails(() => joinGroup(c, { name: "Nour Ali", phone: "01011112222", sizeId: "M" }, NOW))).toBe("invalid");
    expect(joinGroup(c, { name: "Nour Ali", phone: "01011112222", sizeId: "M", number: "7" }, NOW).member.number).toBe("7");
  });

  it("only allows names on the class list", () => {
    const { code: c } = createGroup(input({ settings: { allowedSizes: ["M"], allowQuantity: false, allowedNames: ["Mariam Hassan", "سارة أحمد"] } }), NOW);
    expect(fails(() => joinGroup(c, { name: "Random Person", phone: "01011112222", sizeId: "M" }, NOW))).toBe("notOnList");
    expect(joinGroup(c, { name: "ساره احمد", phone: "01011112222", sizeId: "M" }, NOW).member.name).toBe("ساره احمد");
  });

  it("stops at the piece limit", () => {
    const { code: c } = createGroup(input({ settings: { allowedSizes: ["M"], allowQuantity: true, maxPieces: 3 } }), NOW);
    joinGroup(c, { name: "A One", phone: "01011112221", sizeId: "M", quantity: 2 }, NOW);
    expect(fails(() => joinGroup(c, { name: "B Two", phone: "01011112222", sizeId: "M", quantity: 2 }, NOW))).toBe("full");
    expect(joinGroup(c, { name: "C Three", phone: "01011112223", sizeId: "M", quantity: 1 }, NOW).member.quantity).toBe(1);
  });

  it("closes after the deadline and when locked", () => {
    const { code: c, adminKey } = createGroup(input(), NOW);
    const after = new Date(Date.UTC(2026, 11, 1, 10, 0));
    expect(fails(() => joinGroup(c, { name: "Late Person", phone: "01011112222", sizeId: "M" }, after))).toBe("pastDeadline");
    updateGroup(c, adminKey, { status: "locked" }, NOW);
    expect(fails(() => joinGroup(c, { name: "Locked Out", phone: "01011112222", sizeId: "M" }, NOW))).toBe("closed");
    expect(getPublicGroup(c, NOW)!.isOpen).toBe(false);
  });
});

describe("editing", () => {
  it("lets members edit and leave with their own key, and the organizer with theirs", () => {
    const { code: c, adminKey } = createGroup(input(), NOW);
    const { member, editKey } = joinGroup(c, { name: "Omar Adel", phone: "01122223333", sizeId: "L" }, NOW);
    expect(updateMember(c, member.id, editKey, { sizeId: "XL" }, NOW).sizeId).toBe("XL");
    expect(fails(() => updateMember(c, member.id, "wrong-key", { sizeId: "M" }, NOW))).toBe("unauthorized");
    expect(getMember(c, member.id, adminKey).sizeId).toBe("XL");

    updateGroup(c, adminKey, { status: "locked" }, NOW);
    expect(fails(() => updateMember(c, member.id, editKey, { sizeId: "M" }, NOW))).toBe("closed");
    expect(updateMember(c, member.id, adminKey, { sizeId: "M" }, NOW).sizeId).toBe("M");

    deleteMember(c, member.id, adminKey, NOW);
    expect(getAdminGroup(c, adminKey, NOW).members).toHaveLength(0);
  });

  it("keeps the organizer view private", () => {
    const { code: c, adminKey } = createGroup(input(), NOW);
    joinGroup(c, { name: "Omar Adel", phone: "01122223333", sizeId: "L" }, NOW);
    expect(fails(() => getAdminGroup(c, "nope", NOW))).toBe("unauthorized");
    const admin = getAdminGroup(c, adminKey, NOW);
    expect(admin.members[0]).toMatchObject({ name: "Omar Adel", phone: "01122223333" });
    expect(admin.organizer.phone).toBe("01012345678");
  });

  it("adds a pasted list as the organizer and skips duplicates", () => {
    const { code: c, adminKey } = createGroup(input(), NOW);
    joinGroup(c, { name: "Omar Adel", phone: "01122223333", sizeId: "L" }, NOW);
    const r = addMembersAsOrganizer(
      c,
      adminKey,
      [
        { name: "Nour Ali", phone: "", sizeId: "S" },
        { name: "omar adel", phone: "", sizeId: "M" },
        { name: "Salma Tarek", phone: "", sizeId: "M" },
      ],
      NOW,
    );
    expect(r).toEqual({ added: 2, skipped: [{ name: "omar adel", reason: "duplicateName" }] });
  });

  it("lets the organizer extend the deadline but not move it into the past", () => {
    const { code: c, adminKey } = createGroup(input(), NOW);
    expect(updateGroup(c, adminKey, { deadline: "2026-12-10" }, NOW).deadline).toBe("2026-12-10");
    expect(fails(() => updateGroup(c, adminKey, { deadline: "2026-11-01" }, NOW))).toBe("invalid");
  });
});

describe("uploaded files", () => {
  it("recognizes real image types and rejects others", () => {
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffType(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("image/svg+xml");
    expect(sniffType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
  });

  it("never replaces an existing upload", () => {
    expect(saveAsset("test-asset-0002", PNG)).toBe("saved");
    expect(saveAsset("test-asset-0002", PNG)).toBe("exists");
    expect(saveAsset("test-asset-0003", Buffer.from("not an image"))).toBe("badType");
  });
});
