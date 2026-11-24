import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, type AdminUser, type Permission } from "@/lib/admin/roles";
import { SESSION_COOKIE, SESSION_DAYS, sessionUser } from "./auth";
import { ApiFailure } from "./errors";
import { errorResponse, json } from "./http";

/** Helpers for the admin pages and the /api/admin routes. */

function cookieFrom(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionToken(req: Request): string | null {
  return cookieFrom(req, SESSION_COOKIE);
}

/** Changes must come from the site's own pages (a second guard after the SameSite cookie). */
function fromThisSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return [req.headers.get("host"), req.headers.get("x-forwarded-host")].includes(host);
}

/** The signed-in team member, after checking they're allowed to do this. */
export function requireTeam(req: Request, permission?: Permission): AdminUser {
  if (req.method !== "GET" && !fromThisSite(req)) throw new ApiFailure("forbidden", 403, ["origin"]);
  const user = sessionUser(sessionToken(req));
  if (!user) throw new ApiFailure("unauthorized", 401);
  if (permission && !can(user.role, permission)) throw new ApiFailure("forbidden", 403);
  return user;
}

/** Runs an admin route: checks the login and role, turns errors into JSON. */
export async function team(req: Request, permission: Permission | undefined, fn: (user: AdminUser) => unknown): Promise<Response> {
  try {
    const user = requireTeam(req, permission);
    const out = await fn(user);
    return out instanceof Response ? out : json(out ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export function sessionCookie(token: string, req: Request): string {
  const secure = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure ? "; Secure" : ""}`;
}

export const clearedSessionCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

const LOOPBACK = /^(127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3})$/;

/**
 * True only when the request comes straight from this computer, not through
 * the share link. The first owner login can only be created this way.
 * Next.js itself adds x-forwarded-for with the caller's address, which is a
 * loopback address for this computer; the Cloudflare tunnel adds its own
 * headers and the visitor's real address.
 */
export function isLocal(h: Headers): boolean {
  if (h.get("cf-connecting-ip") || h.get("cf-ray") || h.get("x-real-ip")) return false;
  const forwarded = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (forwarded.some((ip) => !LOOPBACK.test(ip))) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h.get("host") ?? "");
}

/** The signed-in team member for a server-rendered admin page, or null. */
export async function currentTeamMember(): Promise<AdminUser | null> {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function isLocalPage(): Promise<boolean> {
  return isLocal(await headers());
}

/** For admin pages: sends people who aren't signed in to the login page, and people without access back to orders. */
export async function requirePageUser(permission?: Permission): Promise<AdminUser> {
  const user = await currentTeamMember();
  if (!user) redirect("/admin/login");
  if (permission && !can(user.role, permission)) redirect("/admin/orders");
  return user;
}
