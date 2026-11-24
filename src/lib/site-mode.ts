/**
 * The site also has a copy on GitHub Pages (built by `npm run pages`). GitHub
 * Pages only serves files: there's no server or database there, so online
 * checkout, group links, order tracking, uploads and the admin panel don't
 * exist. Instead, orders and "send it to us" requests go to WhatsApp.
 *
 * These values are fixed when the site is built; the normal site has them empty.
 */

export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

/** Where the GitHub Pages copy lives, e.g. "/arcane-website". The Arabic copy is under "/arcane-website/ar". */
export const STATIC_ROOT = process.env.NEXT_PUBLIC_STATIC_ROOT ?? "";

/** Reads a value from the address bar (the GitHub Pages copy can't read it on a server). */
export function queryParam(name: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}
