"use client";

import { BellRing, ClipboardPaste, Download, Lock, LockOpen, Pencil, ShoppingBag, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GarmentImage } from "@/components/three/GarmentImage";
import { ensureCartLoaded, useCartStore } from "@/lib/cart/store";
import type { Catalog } from "@/lib/catalog/types";
import { normalizeDesign } from "@/lib/design/logic";
import { ApiError, api, groupUrl, organizerKey, rememberGroup, takeHashParams, whatsappShare } from "@/lib/group/client";
import { addDays, cairoToday, daysLeft } from "@/lib/group/rules";
import type { AdminGroup, GroupMember } from "@/lib/group/types";
import { formatDate } from "@/lib/order/dates";
import { parseRosterText } from "@/lib/order/roster";
import type { OrderDraft, RosterEntry } from "@/lib/order/types";
import { quote as priceQuote } from "@/lib/pricing/engine";
import { issueMessage } from "@/lib/pricing/issues";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";
import { CopyField, ShareButton } from "./GroupJoin";
import { QrCode } from "./QrCode";

type State = "loading" | "needKey" | "ready" | "error";

export function GroupManage({ code, catalog }: { code: string; catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.group;
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [key, setKey] = useState<string | null>(null);
  const [group, setGroup] = useState<AdminGroup | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const message = (e: unknown) => {
    const c = e instanceof ApiError ? e.code : "server";
    return t.errors[c as keyof typeof t.errors] ?? t.errors.server;
  };

  const load = useCallback(
    async (k: string) => {
      const r = await api<{ group: AdminGroup }>(`/api/groups/${code}/manage`, { key: k });
      setGroup(r.group);
      return r.group;
    },
    [code],
  );

  // The organizer key comes from "#key=…" in the link, or from this device.
  useEffect(() => {
    const hash = takeHashParams();
    const k = hash.key ?? organizerKey(code);
    if (!k) {
      setState("needKey");
      return;
    }
    setKey(k);
    load(k)
      .then((g) => {
        rememberGroup({ code, name: g.name, key: k, createdAt: g.createdAt });
        setState("ready");
      })
      .catch((e) => setState(e instanceof ApiError && e.code === "unauthorized" ? "needKey" : "error"));
  }, [code, load]);

  // Keep the list fresh while people are joining.
  useEffect(() => {
    if (state !== "ready" || !key || group?.status === "closed") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(key).catch(() => undefined);
    }, 20_000);
    return () => clearInterval(timer);
  }, [state, key, group?.status, load]);

  const design = useMemo(() => (group ? normalizeDesign(catalog, group.design) : null), [catalog, group]);
  const sizes = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of group?.members ?? []) out[m.sizeId] = (out[m.sizeId] ?? 0) + m.quantity;
    return out;
  }, [group]);
  const quote = useMemo(() => (design && group ? priceQuote(catalog, design, { sizes, deliverySpeedId: group.deliverySpeedId }) : null), [catalog, design, group, sizes]);

  if (state === "loading") return <Shell><div className="card h-64 animate-pulse" aria-busy="true" /></Shell>;
  if (state === "needKey" || state === "error" || !group || !design || !quote || !key) {
    return (
      <Shell>
        <div className="card mx-auto max-w-xl p-6 text-center">
          <h1 className="font-serif text-xl font-bold text-gold">{state === "error" ? t.errors.server : t.needKey}</h1>
          {state !== "error" ? <p className="mt-2 text-sm text-cream-muted">{t.needKeyHint}</p> : null}
        </div>
      </Shell>
    );
  }

  const link = groupUrl(group.code);
  const organizerLink = `${link}/manage#key=${key}`;
  const deadlineText = formatDate(new Date(`${group.deadline}T12:00:00`), locale);
  const left = daysLeft(group.deadline);
  const pieces = group.members.reduce((s, m) => s + m.quantity, 0);
  const statusLabel = { open: t.statusOpen, locked: t.statusLocked, closed: t.statusClosed }[group.status];
  const money = (n: number) => formatMoney(n, locale);

  const patchGroup = async (body: Record<string, unknown>, done?: string) => {
    setError(null);
    try {
      const r = await api<{ group: AdminGroup }>(`/api/groups/${code}/manage`, { method: "PATCH", body, key });
      setGroup(r.group);
      if (done) setNotice(done);
    } catch (e) {
      setError(message(e));
    }
  };

  const closeAndAddToCart = async () => {
    if (!window.confirm(fmt(t.closeConfirm, { count: pieces }))) return;
    await patchGroup({ status: "closed" });
    const roster: RosterEntry[] = group.members.flatMap((m) =>
      Array.from({ length: m.quantity }, (_, i) => ({ id: `${m.id}-${i}`, name: m.name, number: m.number, sizeId: m.sizeId })),
    );
    const order: OrderDraft = { sizes, roster, deliverySpeedId: group.deliverySpeedId };
    await ensureCartLoaded();
    useCartStore.getState().add(design, order, group.code);
    router.push("/cart");
  };

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{t.manageTitle}</p>
          <h1 className="mt-2 font-display text-4xl tracking-wide uppercase sm:text-5xl" dir="auto">
            {group.name}
          </h1>
          <p className="mt-2 text-sm text-cream-muted">
            {fmt(t.closesOn, { date: deadlineText })}
            {group.isOpen ? ` · ${left > 0 ? fmt(t.daysLeft, { count: left }) : t.lastDay}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${group.status === "open" ? "bg-emerald-900/50 text-emerald-200" : group.status === "locked" ? "bg-gold/15 text-gold-light" : "bg-arcane/70 text-cream"}`}>
          {statusLabel}
        </span>
      </header>

      {notice ? (
        <p role="status" className="mt-4 rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold-light">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label={t.people} value={String(group.members.length)} />
        <Stat label={t.pieces} value={String(pieces)} />
        <Stat label={t.estimatedTotal} value={money(quote.total)} sub={pieces ? fmt(t.perPiece, { amount: money(Math.round(quote.total / pieces)) }) : undefined} />
      </div>
      {pieces ? (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {catalog.sizes
            .filter((s) => sizes[s.id])
            .map((s) => (
              <span key={s.id} className="rounded-full border border-line px-2.5 py-1 text-xs text-cream" dir="ltr">
                {s.label} × {sizes[s.id]}
              </span>
            ))}
        </p>
      ) : null}
      {quote.issues.length ? (
        <ul className="mt-3 space-y-1.5">
          {quote.issues.map((issue, i) => (
            <li key={i} className="rounded-lg bg-gold/10 px-3 py-2 text-sm text-gold-light">
              {issueMessage(issue, dict, catalog, locale)}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <Members catalog={catalog} group={group} adminKey={key} onChanged={() => void load(key)} onNotice={setNotice} onError={setError} />
        </div>

        <aside className="space-y-6">
          {group.status !== "closed" ? (
            <section className="card space-y-3 p-5">
              <h2 className="font-serif text-lg font-bold text-gold">{t.shareTitle}</h2>
              <p className="text-xs text-cream-muted">{t.shareHint}</p>
              <CopyField value={link} label={t.shareTitle} />
              <a href={whatsappShare(fmt(t.shareMessage, { name: group.name, date: deadlineText, link }))} target="_blank" rel="noreferrer" className="btn btn-primary w-full">
                {t.shareWhatsApp}
              </a>
              <a href={whatsappShare(fmt(t.reminderMessage, { name: group.name, date: deadlineText, link }))} target="_blank" rel="noreferrer" className="btn btn-secondary w-full">
                <BellRing className="h-4 w-4" aria-hidden /> {t.sendReminder}
              </a>
              <QrCode value={link} label={t.qrLabel} downloadLabel={t.downloadQr} fileName={`arcane-${group.code}-qr.svg`} />
            </section>
          ) : (
            <section className="card space-y-3 p-5">
              <p className="text-sm text-cream">{t.closedNote}</p>
              <Link href="/cart" className="btn btn-primary w-full">
                <ShoppingBag className="h-4 w-4" aria-hidden /> {t.viewCart}
              </Link>
              <button type="button" className="btn btn-secondary w-full" onClick={() => void patchGroup({ status: "open" })}>
                {t.reopen}
              </button>
            </section>
          )}

          <section className="card p-3">
            <div className="grid grid-cols-2 gap-2">
              {(["front", "back"] as const).map((v) => (
                <GarmentImage key={v} catalog={catalog} design={design} view={v} width={280} height={320} alt={`${group.name} · ${v === "front" ? dict.designer.front : dict.designer.back}`} className="h-auto w-full" />
              ))}
            </div>
          </section>

          {group.status !== "closed" ? (
            <section className="card space-y-4 p-5">
              <h2 className="font-serif text-lg font-bold text-gold">{t.settingsTitle}</h2>
              <DeadlineEditor value={group.deadline} label={t.deadline} saveLabel={t.saveDate} onSave={(deadline) => void patchGroup({ deadline }, t.dateSaved)} />
              <div>
                <button
                  type="button"
                  className="btn btn-secondary w-full"
                  onClick={() => void patchGroup({ status: group.status === "locked" ? "open" : "locked" })}
                >
                  {group.status === "locked" ? <LockOpen className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                  {group.status === "locked" ? t.unlock : t.lock}
                </button>
                <p className="mt-1.5 text-xs text-cream-muted">{t.lockHint}</p>
              </div>
              <div className="border-t border-line pt-4">
                <h3 className="font-semibold text-cream">{t.closeTitle}</h3>
                <p className="mt-1 text-xs text-cream-muted">{t.closeBody}</p>
                <button type="button" disabled={!pieces} onClick={() => void closeAndAddToCart()} className="btn btn-primary mt-3 w-full disabled:opacity-50">
                  <ShoppingBag className="h-4 w-4" aria-hidden /> {t.closeButton}
                </button>
              </div>
            </section>
          ) : null}

          <section className="card space-y-2 p-5">
            <h2 className="font-semibold text-cream">{t.organizerLinkTitle}</h2>
            <p className="text-xs text-cream-muted">{t.organizerLinkHint}</p>
            <CopyField value={organizerLink} label={t.organizerLinkTitle} />
          </section>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="section py-8 sm:py-12">{children}</div>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold tracking-wider text-cream-muted uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl tracking-wide text-gold">{value}</p>
      {sub ? <p className="text-xs text-cream-muted">{sub}</p> : null}
    </div>
  );
}

function DeadlineEditor({ value, label, saveLabel, onSave }: { value: string; label: string; saveLabel: string; onSave: (v: string) => void }) {
  const [date, setDate] = useState(value);
  useEffect(() => setDate(value), [value]);
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-cream-muted">{label}</span>
      <span className="flex gap-2">
        <input type="date" value={date} min={cairoToday()} max={addDays(cairoToday(), 120)} onChange={(e) => setDate(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-cream focus:border-gold focus:outline-none" />
        <button type="button" disabled={!date || date === value} onClick={() => onSave(date)} className="rounded-lg border border-gold/50 px-3 py-2 text-sm text-cream hover:bg-gold/10 disabled:opacity-40">
          {saveLabel}
        </button>
      </span>
    </label>
  );
}

/* ---------- Members table ---------- */

const blankRow = { name: "", phone: "", number: "", sizeId: "", quantity: 1 };

function Members({
  catalog,
  group,
  adminKey,
  onChanged,
  onNotice,
  onError,
}: {
  catalog: Catalog;
  group: AdminGroup;
  adminKey: string;
  onChanged: () => void;
  onNotice: (m: string | null) => void;
  onError: (m: string | null) => void;
}) {
  const { dict } = useI18n();
  const t = dict.group;
  const p = group.design.personalization;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState(blankRow);
  const [adding, setAdding] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const sizeLabel = (id: string) => catalog.sizes.find((s) => s.id === id)?.label ?? id;
  const message = (e: unknown) => {
    const c = e instanceof ApiError ? e.code : "server";
    return t.errors[c as keyof typeof t.errors] ?? t.errors.server;
  };

  const run = async (fn: () => Promise<unknown>) => {
    onError(null);
    onNotice(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      onError(message(e));
      return false;
    }
  };

  const saveEdit = (m: GroupMember) =>
    run(() => api(`/api/groups/${group.code}/members/${m.id}`, { method: "PATCH", key: adminKey, body: { name: draft.name, phone: draft.phone, number: draft.number, sizeId: draft.sizeId, quantity: draft.quantity } })).then(
      (ok) => ok && setEditing(null),
    );

  const addOne = () =>
    run(async () => {
      const r = await api<{ added: number; skipped: unknown[] }>(`/api/groups/${group.code}/manage/members`, { method: "POST", key: adminKey, body: { members: [{ ...draft, number: draft.number || undefined }] } });
      if (r.skipped.length) throw new ApiError("duplicateName");
    }).then((ok) => {
      if (ok) {
        setDraft(blankRow);
        setAdding(false);
      }
    });

  const addPasted = () =>
    run(async () => {
      const rows = parseRosterText(pasteText, catalog).filter((r) => r.name && r.sizeId);
      if (!rows.length) throw new ApiError("invalid");
      const r = await api<{ added: number; skipped: unknown[] }>(`/api/groups/${group.code}/manage/members`, {
        method: "POST",
        key: adminKey,
        body: { members: rows.map((row) => ({ name: row.name, number: row.number || undefined, sizeId: row.sizeId, phone: "" })) },
      });
      onNotice(fmt(t.addedSkipped, { added: r.added, skipped: r.skipped.length }));
      setPasteText("");
      setPasteOpen(false);
    });

  const exportCsv = () => {
    const header = ["Name", "Mobile", ...(p.numbers ? ["Number"] : []), "Size", "Quantity", "Joined"];
    const rows = group.members.map((m) => [m.name, m.phone, ...(p.numbers ? [m.number] : []), sizeLabel(m.sizeId), String(m.quantity), m.createdAt.slice(0, 10)]);
    const csv = [header, ...rows].map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    // BOM so Excel opens Arabic names correctly.
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `arcane-${group.code}-list.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const rowInputs = (
    <>
      <input aria-label={t.name} value={draft.name} dir="auto" maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-ink px-2.5 text-sm text-cream" />
      <input aria-label={t.phoneColumn} value={draft.phone} dir="ltr" inputMode="tel" onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="h-9 w-32 rounded-lg border border-line bg-ink px-2.5 text-sm text-cream" />
      {p.numbers ? (
        <input aria-label={t.number} value={draft.number} inputMode="numeric" maxLength={3} onChange={(e) => setDraft({ ...draft, number: e.target.value.replace(/[^0-9]/g, "") })} className="h-9 w-16 rounded-lg border border-line bg-ink px-2.5 text-center text-sm text-cream" />
      ) : null}
      <select aria-label={t.size} value={draft.sizeId} onChange={(e) => setDraft({ ...draft, sizeId: e.target.value })} className="h-9 rounded-lg border border-line bg-ink px-2 text-sm text-cream">
        <option value="">{dict.designer.chooseSize}</option>
        {group.settings.allowedSizes.map((id) => (
          <option key={id} value={id}>
            {sizeLabel(id)}
          </option>
        ))}
      </select>
      {group.settings.allowQuantity ? (
        <input aria-label={t.quantity} type="number" min={1} max={10} value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} className="h-9 w-16 rounded-lg border border-line bg-ink px-2 text-center text-sm text-cream" />
      ) : null}
    </>
  );

  return (
    <section aria-labelledby="members-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="members-title" className="font-serif text-xl font-bold text-gold">
          {t.membersTitle}
        </h2>
        {group.members.length ? (
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 text-sm text-cream-muted hover:text-gold">
            <Download className="h-4 w-4" aria-hidden /> {t.exportCsv}
          </button>
        ) : null}
      </div>

      {group.members.length === 0 ? (
        <p className="card p-5 text-sm text-cream-muted">{t.noMembers}</p>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {group.members.map((m, i) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="w-6 text-xs text-cream-muted">{i + 1}</span>
              {editing === m.id ? (
                <>
                  {rowInputs}
                  <button type="button" onClick={() => void saveEdit(m)} className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-ink">
                    {t.save}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="px-2 py-1.5 text-sm text-cream-muted">
                    {t.cancel}
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-semibold text-cream" dir="auto">
                    {m.name}
                  </span>
                  <span className="text-sm text-cream-muted" dir="ltr">
                    {m.phone || "—"}
                  </span>
                  {p.numbers ? <span className="w-10 text-center text-sm text-cream">#{m.number}</span> : null}
                  <span className="w-14 text-center text-sm font-semibold text-gold" dir="ltr">
                    {sizeLabel(m.sizeId)}
                    {m.quantity > 1 ? ` ×${m.quantity}` : ""}
                  </span>
                  {group.status !== "closed" ? (
                    <span className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`${t.edit} ${m.name}`}
                        onClick={() => {
                          setDraft({ name: m.name, phone: m.phone, number: m.number, sizeId: m.sizeId, quantity: m.quantity });
                          setEditing(m.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-cream-muted hover:bg-gold/10 hover:text-gold"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`${t.remove} ${m.name}`}
                        onClick={() => {
                          if (window.confirm(fmt(t.removeConfirm, { name: m.name }))) void run(() => api(`/api/groups/${group.code}/members/${m.id}`, { method: "DELETE", key: adminKey }));
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-cream-muted hover:bg-arcane hover:text-cream"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </span>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {group.status !== "closed" ? (
        <div className="mt-3 space-y-3">
          {adding ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 p-3">
              {rowInputs}
              <button type="button" onClick={() => void addOne()} className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-ink">
                {t.add}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="px-2 py-1.5 text-sm text-cream-muted">
                {t.cancel}
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(blankRow);
                setEditing(null);
                setAdding(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gold/50 px-3 py-2 text-sm text-cream hover:bg-gold/10"
            >
              <UserPlus className="h-4 w-4" aria-hidden /> {t.addPerson}
            </button>
            <button type="button" aria-expanded={pasteOpen} onClick={() => setPasteOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-cream-muted hover:text-cream">
              <ClipboardPaste className="h-4 w-4" aria-hidden /> {t.pasteList}
            </button>
          </div>
          {pasteOpen ? (
            <div className="space-y-2 rounded-xl border border-line bg-ink/50 p-3">
              <p className="text-xs text-cream-muted">{t.pasteHint}</p>
              <textarea value={pasteText} rows={5} dir="auto" placeholder={dict.designer.pastePlaceholder} onChange={(e) => setPasteText(e.target.value)} className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-cream" />
              <button type="button" onClick={() => void addPasted()} className="btn btn-primary px-4 py-2">
                {t.add}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
