"use client";

import { KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api-client";
import { ROLES, type AdminUser, type Role } from "@/lib/admin/roles";
import { Badge, Field, inputClass, Panel, primaryButton, smallButton } from "./ui";

const ERRORS: Record<string, string> = {
  taken: "That username is already used.",
  lastOwner: "There must always be at least one owner who can sign in.",
  invalid: "Check the fields. Usernames are 3–30 letters, numbers, dots or dashes; passwords need at least 8 characters.",
  forbidden: "Only an owner can manage the team.",
  network: "Couldn't reach the server. Try again.",
  server: "Something went wrong. Try again.",
};
const errorText = (e: unknown) => ERRORS[e instanceof ApiError ? e.code : "server"] ?? ERRORS.server!;

/** A readable random password to give a new team member (no 0/O, 1/l/I). */
function makePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => alphabet[b % alphabet.length]).join("");
}

export function TeamManager({ users, me }: { users: AdminUser[]; me: AdminUser }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", role: "staff" as Role, password: makePassword() });
  const [resetFor, setResetFor] = useState<{ id: string; password: string } | null>(null);

  const call = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      router.refresh();
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const patch = (u: AdminUser, body: Record<string, unknown>, done: string) => call(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", body }), done);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide uppercase">Team</h1>
        <p className="mt-1 text-sm text-cream-muted">Give each person their own login, so you can see who did what on each order.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-arcane/70 px-4 py-3 text-sm text-cream">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl bg-emerald-900/40 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}

      <Panel title="Who can sign in">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-cream-muted uppercase">
              <tr>
                <th className="pb-2 font-semibold">Name</th>
                <th className="pb-2 font-semibold">Username</th>
                <th className="pb-2 font-semibold">Role</th>
                <th className="pb-2 font-semibold">Access</th>
                <th className="pb-2 font-semibold">Password</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td className="py-2 text-cream">
                    {u.name} {u.id === me.id ? <Badge tone="gold">You</Badge> : null}
                  </td>
                  <td className="py-2 text-cream-muted">{u.username}</td>
                  <td className="py-2">
                    <select
                      value={u.role}
                      disabled={busy}
                      onChange={(e) => void patch(u, { role: e.target.value }, `${u.name} is now ${ROLES.find((r) => r.id === e.target.value)?.label}.`)}
                      aria-label={`Role for ${u.name}`}
                      className="rounded-md border border-line bg-ink px-2 py-1 text-cream"
                    >
                      {ROLES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (u.active && !window.confirm(`Turn off ${u.name}'s access? They'll be signed out everywhere.`)) return;
                        void patch(u, { active: !u.active }, u.active ? `${u.name} can no longer sign in.` : `${u.name} can sign in again.`);
                      }}
                      className={smallButton}
                    >
                      {u.active ? "Turn off" : "Turn back on"}
                    </button>
                  </td>
                  <td className="py-2">
                    {resetFor?.id === u.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <input value={resetFor.password} onChange={(e) => setResetFor({ id: u.id, password: e.target.value })} aria-label={`New password for ${u.name}`} className={`${inputClass} w-36`} />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patch(u, { password: resetFor.password }, `New password set for ${u.name}. Give it to them and ask them to change it.`).then((ok) => ok && setResetFor(null))}
                          className={primaryButton}
                        >
                          Set
                        </button>
                        <button type="button" onClick={() => setResetFor(null)} className="text-cream-muted hover:text-cream">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => setResetFor({ id: u.id, password: makePassword() })} className={smallButton}>
                        <KeyRound className="h-4 w-4" aria-hidden /> New password
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 space-y-1 text-xs text-cream-muted">
          {ROLES.map((r) => (
            <li key={r.id}>
              <span className="font-semibold text-cream">{r.label}:</span> {r.hint}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Add someone">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void call(() => api("/api/admin/users", { method: "POST", body: form }), `Login created for ${form.name.trim()}. Give them the username “${form.username.trim().toLowerCase()}” and the password.`).then(
              (ok) => ok && setForm({ name: "", username: "", role: "staff", password: makePassword() }),
            );
          }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Name">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className={inputClass} />
          </Field>
          <Field label="Username" hint="3–30 letters, numbers, dots or dashes">
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} autoCapitalize="none" required className={inputClass} />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className={inputClass}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="First password" hint="Share it with them privately; they can change it in My account">
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required className={inputClass} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busy} className={primaryButton}>
              <UserPlus className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Create login"}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
