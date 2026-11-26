"use client";

import { Camera, CalendarClock, Check, Copy, Minus, Plus, Rotate3d, Ruler, Share2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Star } from "@/components/brand/Star";
import { canShowPhoto, GarmentView, useViewMode, ViewModeToggle } from "@/components/garment/GarmentView";
import { SizeChartButton } from "@/components/size/SizeChart";
import type { Catalog } from "@/lib/catalog/types";
import { areaSide } from "@/lib/design/areas";
import type { StageView } from "@/lib/three/stage";
import { ApiError, api, groupUrl, myMembership, rememberMembership, takeHashParams, whatsappShare, type MyMembership } from "@/lib/group/client";
import { daysLeft, normalizePhone } from "@/lib/group/rules";
import type { GroupMember, PublicGroup } from "@/lib/group/types";
import { formatDate } from "@/lib/order/dates";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { siteConfig } from "@/config/site";

type Mode = "loading" | "form" | "joined" | "editing";
const emptyForm = { name: "", phone: "", number: "", sizeId: "", quantity: 1 };

export function GroupJoin({ group, catalog }: { group: PublicGroup; catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.group;
  const p = group.design.personalization;
  const [mode, setMode] = useState<Mode>("loading");
  const [membership, setMembership] = useState<MyMembership | null>(null);
  const [member, setMember] = useState<GroupMember | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [justJoined, setJustJoined] = useState(false);
  const deadlineDate = formatDate(new Date(`${group.deadline}T12:00:00`), locale);
  const left = daysLeft(group.deadline);

  // Find this person's entry: from a private edit link (#member=ID.KEY) or remembered on this phone.
  useEffect(() => {
    const hash = takeHashParams();
    if (hash.member) {
      const [memberId, key] = hash.member.split(".");
      if (memberId && key) rememberMembership(group.code, { memberId, key });
    }
    const saved = myMembership(group.code);
    if (!saved) {
      setMode("form");
      return;
    }
    setMembership(saved);
    api<{ member: GroupMember }>(`/api/groups/${group.code}/members/${saved.memberId}`, { key: saved.key })
      .then((r) => {
        setMember(r.member);
        setMode("joined");
      })
      .catch(() => {
        rememberMembership(group.code, null);
        setMembership(null);
        setMode("form");
      });
  }, [group.code]);

  const problems = {
    name: form.name.trim().length < 2,
    phone: !normalizePhone(form.phone),
    number: p.numbers && !/^\d{1,3}$/.test(form.number),
    sizeId: !form.sizeId,
  };
  const invalid = Object.values(problems).some(Boolean);
  const message = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : "server";
    return t.errors[code as keyof typeof t.errors] ?? t.errors.server;
  };

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (invalid) return;
    setBusy(true);
    const body = { name: form.name.trim(), phone: form.phone, number: p.numbers ? form.number : undefined, sizeId: form.sizeId, quantity: group.settings.allowQuantity ? form.quantity : 1 };
    try {
      if (mode === "editing" && membership && member) {
        const r = await api<{ member: GroupMember }>(`/api/groups/${group.code}/members/${member.id}`, { method: "PATCH", body, key: membership.key });
        setMember(r.member);
      } else {
        const r = await api<{ member: GroupMember; editKey: string }>(`/api/groups/${group.code}/members`, { method: "POST", body });
        const m = { memberId: r.member.id, key: r.editKey };
        rememberMembership(group.code, m);
        setMembership(m);
        setMember(r.member);
        setJustJoined(true);
      }
      setMode("joined");
      setTouched(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!membership || !member || !window.confirm(t.leaveConfirm)) return;
    setBusy(true);
    try {
      await api(`/api/groups/${group.code}/members/${member.id}`, { method: "DELETE", key: membership.key });
      rememberMembership(group.code, null);
      setMembership(null);
      setMember(null);
      setForm(emptyForm);
      setNotice(t.removed);
      setMode("form");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const shareText = fmt(t.shareMessage, { name: group.name, date: deadlineDate, link: typeof window === "undefined" ? "" : groupUrl(group.code) });
  const previewName = (mode === "form" || mode === "editing" ? form.name : member?.name) || undefined;
  const previewNumber = (mode === "form" || mode === "editing" ? form.number : member?.number) || undefined;
  const sizeLabel = (id: string) => catalog.sizes.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="section py-8 sm:py-12">
      <header className="relative overflow-hidden rounded-3xl border border-gold/30 bg-arcane/50 p-6 sm:p-8">
        <Star className="absolute -end-6 -top-6 h-28 w-28 text-gold/10" />
        <p className="eyebrow">{fmt(t.organizedBy, { name: group.organizerFirstName })}</p>
        <h1 className="mt-2 font-display text-4xl tracking-wide text-cream uppercase sm:text-5xl" dir="auto">
          {group.name}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Chip icon={<CalendarClock className="h-4 w-4" aria-hidden />}>
            {fmt(t.closesOn, { date: deadlineDate })}
            {group.isOpen ? ` · ${left > 0 ? fmt(t.daysLeft, { count: left }) : t.lastDay}` : ""}
          </Chip>
          <Chip icon={<Users className="h-4 w-4" aria-hidden />}>{fmt(t.joinedCount, { count: group.memberCount })}</Chip>
        </div>
        <p className="mt-4 text-sm text-cream/85">{fmt(t.organizerPays, { name: group.organizerFirstName })}</p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <JoinViewer catalog={catalog} group={group} name={previewName} number={previewNumber} />
          {p.names && (mode === "form" || mode === "editing") ? <p className="mt-2 text-center text-xs text-cream-muted">{t.previewHint}</p> : null}
        </div>

        <div className="space-y-4">
          {notice ? (
            <p role="status" className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold-light">
              {notice}
            </p>
          ) : null}

          {mode === "loading" ? <div className="card h-64 animate-pulse" aria-busy="true" /> : null}

          {mode === "joined" && member ? (
            <section className="card space-y-4 p-5" aria-labelledby="joined-title">
              <h2 id="joined-title" className="flex items-center gap-2 font-serif text-xl font-bold text-gold">
                <Check className="h-5 w-5" aria-hidden /> {t.joinedTitle}
              </h2>
              {justJoined ? <p className="text-sm text-cream-muted">{t.joinedBody}</p> : null}
              <dl className="divide-y divide-line rounded-xl border border-line text-sm">
                <Row label={t.name}>{member.name}</Row>
                {p.numbers ? <Row label={t.number}>{member.number}</Row> : null}
                <Row label={t.size}>
                  <span dir="ltr">{sizeLabel(member.sizeId)}</span>
                  {member.quantity > 1 ? ` × ${member.quantity}` : ""}
                </Row>
              </dl>
              {group.isOpen ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setForm({ name: member.name, phone: member.phone, number: member.number, sizeId: member.sizeId, quantity: member.quantity });
                      setMode("editing");
                    }}
                  >
                    {t.editEntry}
                  </button>
                  <button type="button" className="rounded-full px-4 py-2 text-sm text-cream-muted hover:text-arcane-bright" onClick={() => void leave()} disabled={busy}>
                    {t.leave}
                  </button>
                </div>
              ) : null}
              {membership ? <PrivateLink code={group.code} membership={membership} /> : null}
              <ShareButton text={shareText} label={t.shareGroup} />
            </section>
          ) : null}

          {(mode === "form" || mode === "editing") && !group.isOpen ? (
            <section className="card p-5">
              <h2 className="font-serif text-xl font-bold text-gold">{t.closedTitle}</h2>
              <p className="mt-2 text-sm text-cream-muted">{fmt(t.closedBody, { name: group.organizerFirstName })}</p>
            </section>
          ) : null}

          {(mode === "form" || mode === "editing") && group.isOpen ? (
            <section className="card space-y-4 p-5" aria-labelledby="join-title">
              <h2 id="join-title" className="font-serif text-xl font-bold text-gold">
                {mode === "editing" ? t.editEntry : t.joinTitle}
              </h2>
              <Field label={t.name} hint={p.names ? t.namePrintedHint : t.nameHint} error={touched && problems.name ? t.errors.invalid : null}>
                <input
                  value={form.name}
                  maxLength={40}
                  dir="auto"
                  autoComplete="name"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={inputClass(touched && problems.name)}
                />
              </Field>
              <Field label={t.phone} hint={t.phoneHint} error={touched && problems.phone ? dict.group.phoneInvalid : null}>
                <input
                  value={form.phone}
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder={t.phonePlaceholder}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={inputClass(touched && problems.phone)}
                />
              </Field>
              {p.numbers ? (
                <Field label={t.number} error={touched && problems.number ? t.errors.invalid : null}>
                  <input
                    value={form.number}
                    inputMode="numeric"
                    maxLength={3}
                    dir="ltr"
                    onChange={(e) => setForm({ ...form, number: e.target.value.replace(/[^0-9]/g, "") })}
                    className={`${inputClass(touched && problems.number)} max-w-28 text-center`}
                  />
                </Field>
              ) : null}
              <Field label={t.size} error={touched && problems.sizeId ? t.errors.invalid : null}>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.size}>
                  {group.settings.allowedSizes.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={form.sizeId === id}
                      onClick={() => setForm({ ...form, sizeId: id })}
                      className="min-w-14 rounded-xl border border-line px-3 py-2.5 font-semibold text-cream-muted transition-colors hover:border-gold/60 aria-checked:border-gold aria-checked:bg-gold aria-checked:text-ink"
                      dir="ltr"
                    >
                      {sizeLabel(id)}
                    </button>
                  ))}
                </div>
                <SizeChartButton catalog={catalog} productId={group.design.productId} fitId={group.design.fitId} sleeve={group.design.sleeve} fixed className="mt-3" />
              </Field>
              <a
                href={`/send?type=size&product=${encodeURIComponent(group.design.productId)}`}
                target="_blank"
                rel="noopener"
                className="-mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gold hover:text-gold-light"
              >
                <Ruler className="h-4 w-4" aria-hidden /> {dict.send.sizeButton}
              </a>
              {group.settings.allowQuantity ? (
                <Field label={t.quantity}>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={dict.designer.fewer} onClick={() => setForm({ ...form, quantity: Math.max(1, form.quantity - 1) })} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line">
                      <Minus className="h-4 w-4" aria-hidden />
                    </button>
                    <span className="w-8 text-center text-lg font-semibold" aria-live="polite">{form.quantity}</span>
                    <button type="button" aria-label={dict.designer.more} onClick={() => setForm({ ...form, quantity: Math.min(10, form.quantity + 1) })} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line">
                      <Plus className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </Field>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void submit()} disabled={busy} className="btn btn-primary flex-1 disabled:opacity-60 sm:flex-none">
                  {busy ? (mode === "editing" ? t.saving : t.joining) : mode === "editing" ? t.saveChanges : t.join}
                </button>
                {mode === "editing" ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setMode("joined")}>
                    {t.cancel}
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Preview (photo or 3D) with this person's name and number on it. */
function JoinViewer({ catalog, group, name, number }: { catalog: Catalog; group: PublicGroup; name?: string; number?: string }) {
  const { dict } = useI18n();
  const t = dict.designer;
  const p = group.design.personalization;
  const onBack = [p.nameStyle?.areaId, p.numberStyle?.areaId].some((id) => id && areaSide(id) === "back");
  const [view, setView] = useState<StageView>(onBack ? "back" : "front");
  const samples = useMemo(() => ({ name: name || t.sampleName, number: number || t.sampleNumber }), [name, number, t.sampleName, t.sampleNumber]);
  const [mode, setMode] = useViewMode();
  const photos = canShowPhoto(catalog, group.design);
  const photo = mode === "photo" && photos;
  return (
    <div className="card relative overflow-hidden bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,39,0.16),transparent_62%)]">
      <div className="absolute start-3 top-3 z-10 flex flex-col items-start gap-2">
        <div role="group" aria-label={t.viewLabel} className="flex rounded-full border border-line bg-ink/80 p-1 text-sm">
          {(["front", "back"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className="rounded-full px-4 py-1.5 text-cream-muted aria-pressed:bg-gold aria-pressed:text-ink">
              {v === "front" ? t.front : t.back}
            </button>
          ))}
        </div>
        {siteConfig.show3d && photos ? <ViewModeToggle mode={mode} onChange={setMode} /> : null}
      </div>
      <div className={`h-[46vh] lg:h-[60vh] ${photo ? "" : "cursor-grab"}`}>
        <GarmentView
          mode={mode}
          catalog={catalog}
          design={group.design}
          view={view}
          samples={samples}
          className={photo ? "h-full w-full" : "h-full w-full touch-none"}
          label={`${group.name} · ${photo ? t.photoMode : t.mode3d}`}
        />
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1 text-center text-xs text-cream-muted">
          {photo ? <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Rotate3d className="h-3.5 w-3.5 shrink-0" aria-hidden />} {photo ? (siteConfig.show3d ? t.photoHint : t.photoOnlyHint) : t.dragToRotate}
        </span>
      </p>
    </div>
  );
}

function inputClass(bad: boolean) {
  return `w-full rounded-lg border bg-ink px-3 py-2.5 text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none ${bad ? "border-arcane-bright" : "border-line"}`;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-cream">{label}</p>
      {children}
      {error ? <p className="mt-1 text-xs text-arcane-bright">{error}</p> : hint ? <p className="mt-1 text-xs text-cream-muted">{hint}</p> : null}
    </div>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-ink/40 px-3 py-1.5 text-cream">
      {icon}
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-cream-muted">{label}</dt>
      <dd className="text-end font-semibold text-cream">{children}</dd>
    </div>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const { dict } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} dir="ltr" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-xs text-cream-muted" />
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          });
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gold/50 px-3 py-2 text-sm text-cream hover:bg-gold/10"
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copied ? dict.group.copied : dict.group.copy}
      </button>
    </div>
  );
}

function PrivateLink({ code, membership }: { code: string; membership: MyMembership }) {
  const { dict } = useI18n();
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${groupUrl(code)}#member=${membership.memberId}.${membership.key}`), [code, membership]);
  if (!url) return null;
  return (
    <div className="rounded-xl border border-line bg-ink/50 p-3">
      <p className="text-sm font-semibold text-cream">{dict.group.privateLink}</p>
      <p className="mb-2 text-xs text-cream-muted">{dict.group.privateLinkHint}</p>
      <CopyField value={url} label={dict.group.privateLink} />
    </div>
  );
}

export function ShareButton({ text, label, className = "btn btn-secondary" }: { text: string; label: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (typeof navigator !== "undefined" && navigator.share) void navigator.share({ text }).catch(() => undefined);
        else window.open(whatsappShare(text), "_blank", "noopener,noreferrer");
      }}
    >
      <Share2 className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
