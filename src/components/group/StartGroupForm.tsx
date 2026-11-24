"use client";

import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Catalog } from "@/lib/catalog/types";
import { ApiError, api, rememberGroup, uploadDesignAssets } from "@/lib/group/client";
import { addDays, cairoToday, normalizePhone } from "@/lib/group/rules";
import { parseNamesList } from "@/lib/order/roster";
import type { DesignSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";

export function StartGroupForm({ catalog, design, deliverySpeedId, designBlocked }: { catalog: Catalog; design: DesignSelection; deliverySpeedId: string; designBlocked: boolean }) {
  const { dict } = useI18n();
  const t = dict.group;
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    organizerName: "",
    phone: "",
    email: "",
    deadline: addDays(cairoToday(), 7),
    sizes: catalog.sizes.map((s) => s.id),
    allowQuantity: false,
    maxPieces: "",
    classListOn: false,
    classList: "",
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const problems = {
    name: form.name.trim().length < 2,
    organizerName: form.organizerName.trim().length < 2,
    phone: !normalizePhone(form.phone),
    deadline: !form.deadline || form.deadline < cairoToday(),
    sizes: form.sizes.length === 0,
  };
  const invalid = Object.values(problems).some(Boolean);

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (designBlocked) {
      setError(t.designBlocked);
      return;
    }
    if (invalid) return;
    setBusy(true);
    try {
      await uploadDesignAssets(design);
      const allowedNames = form.classListOn ? parseNamesList(form.classList) : [];
      const res = await api<{ code: string; adminKey: string }>("/api/groups", {
        method: "POST",
        body: {
          name: form.name.trim(),
          organizer: { name: form.organizerName.trim(), phone: form.phone, email: form.email.trim() },
          design,
          deliverySpeedId,
          deadline: form.deadline,
          settings: {
            allowedSizes: form.sizes,
            allowQuantity: form.allowQuantity,
            ...(Number(form.maxPieces) > 0 ? { maxPieces: Math.floor(Number(form.maxPieces)) } : {}),
            ...(allowedNames.length ? { allowedNames } : {}),
          },
        },
      });
      rememberGroup({ code: res.code, name: form.name.trim(), key: res.adminKey, createdAt: new Date().toISOString() });
      router.push(`/g/${res.code}/manage`);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "server";
      setError(t.errors[code as keyof typeof t.errors] ?? t.errors.server);
      setBusy(false);
    }
  };

  const fieldClass = (bad: boolean) =>
    `w-full rounded-lg border bg-ink px-3 py-2 text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none ${touched && bad ? "border-arcane-bright" : "border-line"}`;

  return (
    <section className="space-y-4 rounded-2xl border border-gold/40 bg-ink-2/80 p-5" aria-labelledby="start-group-title">
      <div>
        <h3 id="start-group-title" className="flex items-center gap-2 font-serif text-lg font-bold text-gold">
          <Users className="h-5 w-5" aria-hidden /> {t.startTitle}
        </h3>
        <p className="mt-1 text-sm text-cream-muted">{t.startIntro}</p>
      </div>

      <Field label={t.groupName} error={touched && problems.name ? t.required : null}>
        <input value={form.name} maxLength={60} dir="auto" placeholder={t.groupNamePlaceholder} onChange={(e) => set("name", e.target.value)} className={fieldClass(problems.name)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.yourName} error={touched && problems.organizerName ? t.required : null}>
          <input value={form.organizerName} maxLength={60} dir="auto" autoComplete="name" onChange={(e) => set("organizerName", e.target.value)} className={fieldClass(problems.organizerName)} />
        </Field>
        <Field label={t.yourPhone} error={touched && problems.phone ? t.phoneInvalid : null}>
          <input value={form.phone} inputMode="tel" autoComplete="tel" dir="ltr" placeholder={t.phonePlaceholder} onChange={(e) => set("phone", e.target.value)} className={fieldClass(problems.phone)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.yourEmail}>
          <input value={form.email} type="email" autoComplete="email" dir="ltr" onChange={(e) => set("email", e.target.value)} className={fieldClass(false)} />
        </Field>
        <Field label={t.deadline} error={touched && problems.deadline ? t.required : null}>
          <input value={form.deadline} type="date" min={cairoToday()} max={addDays(cairoToday(), 120)} onChange={(e) => set("deadline", e.target.value)} className={fieldClass(problems.deadline)} />
        </Field>
      </div>

      <Field label={t.sizesAllowed} error={touched && problems.sizes ? t.required : null}>
        <div className="flex flex-wrap gap-1.5">
          {catalog.sizes.map((s) => {
            const on = form.sizes.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => set("sizes", on ? form.sizes.filter((x) => x !== s.id) : catalog.sizes.map((c) => c.id).filter((id) => id === s.id || form.sizes.includes(id)))}
                className="rounded-full border border-line px-3 py-1.5 text-sm text-cream-muted aria-pressed:border-gold aria-pressed:bg-gold/10 aria-pressed:text-cream"
                dir="ltr"
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </Field>

      <label className="flex items-center gap-3 text-sm text-cream">
        <input type="checkbox" checked={form.allowQuantity} onChange={(e) => set("allowQuantity", e.target.checked)} className="h-4 w-4 accent-[#C9A227]" />
        {t.allowQuantity}
      </label>
      <Field label={t.maxPieces}>
        <input value={form.maxPieces} type="number" min={1} inputMode="numeric" onChange={(e) => set("maxPieces", e.target.value)} className={`${fieldClass(false)} max-w-40`} />
      </Field>
      <label className="flex items-center gap-3 text-sm text-cream">
        <input type="checkbox" checked={form.classListOn} onChange={(e) => set("classListOn", e.target.checked)} className="h-4 w-4 accent-[#C9A227]" />
        {t.classListToggle}
      </label>
      {form.classListOn ? (
        <Field label={t.classListHint}>
          <textarea value={form.classList} rows={5} dir="auto" onChange={(e) => set("classList", e.target.value)} className={fieldClass(false)} />
        </Field>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
          {error}
        </p>
      ) : null}
      <button type="button" onClick={() => void submit()} disabled={busy} className="btn btn-primary w-full disabled:opacity-60 sm:w-auto">
        {busy ? t.creating : t.create}
      </button>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-cream-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-arcane-bright">{error}</span> : null}
    </label>
  );
}
