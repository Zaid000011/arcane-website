import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

// No 0/O, 1/I: easy to read out loud or type from a poster.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short public code for links, e.g. "K7QM2X". 32 letters → no bias from the modulo. */
export function newCode(length = 6): string {
  return Array.from(randomBytes(length), (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Long random secret for organizer and member edit links. */
export function newSecret(): string {
  return randomBytes(24).toString("base64url");
}

export function newId(): string {
  return randomUUID();
}

/** Secrets are stored hashed, so a copy of the database can't be used to edit orders. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function secretMatches(secret: string | null | undefined, hash: string): boolean {
  if (!secret) return false;
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
