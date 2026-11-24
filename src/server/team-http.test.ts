import { describe, expect, it } from "vitest";
import { isLocal } from "./team-http";

const h = (entries: Record<string, string>) => new Headers(entries);

describe("first-login safety check", () => {
  it("accepts requests from this computer", () => {
    expect(isLocal(h({ host: "localhost:3000" }))).toBe(true);
    expect(isLocal(h({ host: "localhost:3000", "x-forwarded-for": "::1" }))).toBe(true);
    expect(isLocal(h({ host: "127.0.0.1:3000", "x-forwarded-for": "::ffff:127.0.0.1" }))).toBe(true);
  });

  it("refuses the share link and other computers", () => {
    expect(isLocal(h({ host: "removable-forest.trycloudflare.com", "x-forwarded-for": "41.33.1.2" }))).toBe(false);
    expect(isLocal(h({ host: "localhost:3000", "cf-connecting-ip": "41.33.1.2", "x-forwarded-for": "41.33.1.2" }))).toBe(false);
    expect(isLocal(h({ host: "localhost:3000", "cf-ray": "abc" }))).toBe(false);
    expect(isLocal(h({ host: "localhost:3000", "x-forwarded-for": "192.168.1.20" }))).toBe(false);
    expect(isLocal(h({ host: "192.168.1.5:3000", "x-forwarded-for": "127.0.0.1" }))).toBe(false);
  });
});
