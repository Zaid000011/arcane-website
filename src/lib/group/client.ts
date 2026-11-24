"use client";

export { ApiError, api, takeHashParams, uploadDesignAssets, whatsappShare } from "@/lib/api-client";

/* ---------- Links remembered on this device ---------- */

export interface MyGroup {
  code: string;
  name: string;
  key: string;
  createdAt: string;
}

const MY_GROUPS = "arcane-my-groups";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the links still work, they just aren't remembered.
  }
}

export function myGroups(): MyGroup[] {
  return read<MyGroup[]>(MY_GROUPS, []);
}

export function rememberGroup(group: MyGroup) {
  write(MY_GROUPS, [group, ...myGroups().filter((g) => g.code !== group.code)].slice(0, 30));
}

export function organizerKey(code: string): string | null {
  return myGroups().find((g) => g.code === code)?.key ?? null;
}

export interface MyMembership {
  memberId: string;
  key: string;
}

export function myMembership(code: string): MyMembership | null {
  return read<MyMembership | null>(`arcane-member-${code}`, null);
}

export function rememberMembership(code: string, m: MyMembership | null) {
  if (m) write(`arcane-member-${code}`, m);
  else {
    try {
      localStorage.removeItem(`arcane-member-${code}`);
    } catch {
      // Ignore.
    }
  }
}

export function groupUrl(code: string): string {
  return `${window.location.origin}/g/${code}`;
}
