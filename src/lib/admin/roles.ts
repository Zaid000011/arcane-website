/** Team roles and what each can do. Shared by the server (which enforces it) and the admin pages (which hide what you can't use). */

export type Role = "owner" | "staff" | "designer";

export type Permission =
  | "orders.view"
  | "orders.payments"
  | "orders.status"
  | "orders.proofs"
  | "orders.notes"
  | "requests.manage"
  | "prices.edit"
  | "team.manage";

const ALL: Permission[] = ["orders.view", "orders.payments", "orders.status", "orders.proofs", "orders.notes", "requests.manage", "prices.edit", "team.manage"];

const PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  staff: ["orders.view", "orders.payments", "orders.status", "orders.proofs", "orders.notes", "requests.manage"],
  // Designers handle the designs customers send in, so they see requests too.
  designer: ["orders.view", "orders.proofs", "orders.notes", "requests.manage"],
};

export const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: "owner", label: "Owner", hint: "Everything, including prices and team logins" },
  { id: "staff", label: "Staff", hint: "Orders (payments, proofs, status, notes) and customer requests" },
  { id: "designer", label: "Designer", hint: "Sees orders, sends proofs, writes notes, handles customer requests" },
];

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

/** What the admin pages know about the signed-in person. */
export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
}
