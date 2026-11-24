import { beforeEach, describe, expect, it } from "vitest";
import { can } from "@/lib/admin/roles";
import { AuthError, changeOwnPassword, createFirstOwner, createUser, hasUsers, hashPassword, listUsers, login, logout, sessionUser, updateUser, verifyPassword } from "./auth";
import { useMemoryDb } from "./db";

const NOW = new Date(Date.UTC(2026, 10, 23, 10, 0));
const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AuthError ? e.code : String(e);
  }
  return "no error";
};

beforeEach(() => {
  useMemoryDb();
});

describe("passwords", () => {
  it("hashes with a fresh salt and checks correctly", () => {
    const a = hashPassword("correct horse");
    expect(a).not.toBe(hashPassword("correct horse"));
    expect(verifyPassword("correct horse", a)).toBe(true);
    expect(verifyPassword("wrong horse", a)).toBe(false);
    expect(verifyPassword("anything", "garbage")).toBe(false);
  });
});

describe("first owner and signing in", () => {
  it("creates the first owner once, then signs in with a session", () => {
    expect(hasUsers()).toBe(false);
    const owner = createFirstOwner({ name: "Mariam", username: "Mariam", password: "longpassword" }, NOW);
    expect(owner).toMatchObject({ username: "mariam", role: "owner", active: true });
    expect(fails(() => createFirstOwner({ name: "Other", username: "other", password: "longpassword" }, NOW))).toBe("setupDone");

    const { token, user } = login(" MARIAM ", "longpassword", NOW);
    expect(user.id).toBe(owner.id);
    expect(sessionUser(token, NOW)?.username).toBe("mariam");
    expect(sessionUser("made-up", NOW)).toBeNull();
    // Sessions last 30 days.
    expect(sessionUser(token, new Date(NOW.getTime() + 31 * 86_400_000))).toBeNull();

    const second = login("mariam", "longpassword", NOW).token;
    logout(second);
    expect(sessionUser(second, NOW)).toBeNull();
  });

  it("rejects wrong details and weak input", () => {
    createFirstOwner({ name: "Mariam", username: "mariam", password: "longpassword" }, NOW);
    expect(fails(() => login("mariam", "wrong-password", NOW))).toBe("unauthorized");
    expect(fails(() => login("nobody", "longpassword", NOW))).toBe("unauthorized");
    expect(fails(() => createUser({ name: "Omar", username: "o", password: "longpassword", role: "staff" }, NOW))).toBe("invalid");
    expect(fails(() => createUser({ name: "Omar", username: "omar", password: "short", role: "staff" }, NOW))).toBe("invalid");
    expect(fails(() => createUser({ name: "Mariam 2", username: "mariam", password: "longpassword", role: "staff" }, NOW))).toBe("taken");
  });
});

describe("team management", () => {
  it("keeps at least one owner and signs people out when access changes", () => {
    const owner = createFirstOwner({ name: "Mariam", username: "mariam", password: "longpassword" }, NOW);
    expect(fails(() => updateUser(owner.id, { role: "staff" }, NOW))).toBe("lastOwner");
    expect(fails(() => updateUser(owner.id, { active: false }, NOW))).toBe("lastOwner");

    const staff = createUser({ name: "Omar", username: "omar", password: "longpassword", role: "staff" }, NOW);
    const { token } = login("omar", "longpassword", NOW);
    updateUser(staff.id, { active: false }, NOW);
    expect(sessionUser(token, NOW)).toBeNull();
    expect(fails(() => login("omar", "longpassword", NOW))).toBe("unauthorized");

    updateUser(staff.id, { active: true, role: "owner" }, NOW);
    updateUser(owner.id, { role: "designer" }, NOW);
    expect(listUsers().map((u) => [u.username, u.role])).toEqual([
      ["mariam", "designer"],
      ["omar", "owner"],
    ]);
  });

  it("changes your own password and signs out your other devices", () => {
    const owner = createFirstOwner({ name: "Mariam", username: "mariam", password: "longpassword" }, NOW);
    const here = login("mariam", "longpassword", NOW).token;
    const elsewhere = login("mariam", "longpassword", NOW).token;
    expect(fails(() => changeOwnPassword(owner.id, "not-it", "newpassword1", here, NOW))).toBe("wrongPassword");
    changeOwnPassword(owner.id, "longpassword", "newpassword1", here, NOW);
    expect(sessionUser(here, NOW)).not.toBeNull();
    expect(sessionUser(elsewhere, NOW)).toBeNull();
    expect(login("mariam", "newpassword1", NOW).user.id).toBe(owner.id);
  });
});

describe("roles", () => {
  it("gives each role the right access", () => {
    expect(can("owner", "prices.edit")).toBe(true);
    expect(can("staff", "orders.payments")).toBe(true);
    expect(can("staff", "prices.edit")).toBe(false);
    expect(can("designer", "orders.proofs")).toBe(true);
    expect(can("designer", "orders.payments")).toBe(false);
    expect(can("designer", "team.manage")).toBe(false);
  });
});
