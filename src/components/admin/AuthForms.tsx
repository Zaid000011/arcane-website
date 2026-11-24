"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api-client";
import { Field, inputClass, primaryButton } from "./ui";

const MESSAGES: Record<string, string> = {
  unauthorized: "Wrong username or password.",
  tooManyRequests: "Too many tries. Wait 15 minutes and try again.",
  invalid: "Check the fields. Usernames are 3–30 letters, numbers, dots or dashes; passwords need at least 8 characters.",
  taken: "That username is already used.",
  notLocal: "The first login can only be created on the computer that runs the site.",
  setupDone: "Setup is already done. Sign in instead.",
  wrongPassword: "Your current password isn't right.",
  network: "Couldn't reach the server. Check the connection and try again.",
  server: "Something went wrong. Try again.",
};

const message = (e: unknown) => MESSAGES[e instanceof ApiError ? e.code : "server"] ?? MESSAGES.server!;

function useSubmit(run: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  };
  return { busy, error, setError, submit };
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
      {error}
    </p>
  ) : null;
}

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    await api("/api/admin/login", { method: "POST", body: { username, password } });
    router.replace("/admin/orders");
    router.refresh();
  });
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Field label="Username">
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required className={inputClass} />
      </Field>
      <Field label="Password">
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <ErrorText error={error} />
      <button type="submit" disabled={busy} className={`${primaryButton} w-full py-2.5`}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", password: "", confirm: "" });
  const { busy, error, setError, submit } = useSubmit(async () => {
    await api("/api/admin/setup", { method: "POST", body: { name: form.name, username: form.username, password: form.password } });
    router.replace("/admin/orders");
    router.refresh();
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      onSubmit={(e) => {
        if (form.password !== form.confirm) {
          e.preventDefault();
          setError("The two passwords don't match.");
          return;
        }
        void submit(e);
      }}
      className="space-y-4"
    >
      <Field label="Your name">
        <input value={form.name} onChange={set("name")} autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="Username" hint="3–30 lowercase letters, numbers, dots or dashes. You'll sign in with it.">
        <input value={form.username} onChange={set("username")} autoComplete="username" autoCapitalize="none" required className={inputClass} />
      </Field>
      <Field label="Password" hint="At least 8 characters. Pick one only you know.">
        <input value={form.password} onChange={set("password")} type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <Field label="Password again">
        <input value={form.confirm} onChange={set("confirm")} type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <ErrorText error={error} />
      <button type="submit" disabled={busy} className={`${primaryButton} w-full py-2.5`}>
        {busy ? "Creating…" : "Create the owner login"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [done, setDone] = useState(false);
  const { busy, error, setError, submit } = useSubmit(async () => {
    await api("/api/admin/account/password", { method: "POST", body: { current: form.current, next: form.next } });
    setForm({ current: "", next: "", confirm: "" });
    setDone(true);
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setDone(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  return (
    <form
      onSubmit={(e) => {
        if (form.next !== form.confirm) {
          e.preventDefault();
          setError("The two new passwords don't match.");
          return;
        }
        void submit(e);
      }}
      className="max-w-sm space-y-4"
    >
      <Field label="Current password">
        <input value={form.current} onChange={set("current")} type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <Field label="New password" hint="At least 8 characters. Your other devices will be signed out.">
        <input value={form.next} onChange={set("next")} type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <Field label="New password again">
        <input value={form.confirm} onChange={set("confirm")} type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <ErrorText error={error} />
      {done ? (
        <p role="status" className="text-sm text-emerald-300">
          Password changed.
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
