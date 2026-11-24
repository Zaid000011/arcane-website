"use client";

import { CheckCircle2, Copy, ImageUp, PencilLine } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { siteConfig } from "@/config/site";
import { ApiError, api } from "@/lib/api-client";
import type { OrderView } from "@/lib/checkout/types";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type Props = { order: OrderView; orderKey: string; onChange: (order: OrderView) => void };

export function ActionCard({ title, children, tone = "plain" }: { title: string; children: ReactNode; tone?: "gold" | "plain" }) {
  return (
    <section className={`space-y-4 rounded-2xl border p-5 sm:p-6 ${tone === "gold" ? "border-gold/50 bg-arcane/30" : "border-line bg-ink-2/70"}`}>
      <h2 className="font-serif text-xl font-bold text-gold">{title}</h2>
      {children}
    </section>
  );
}

/** An order image (payment screenshot or proof). Fetched with the order key, so it never sits on a public address. */
export function PrivateImage({ code, orderKey, fileId, alt }: { code: string; orderKey: string; fileId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void fetch(`/api/orders/${code}/files/${fileId}`, { headers: { "x-arcane-key": orderKey }, cache: "no-store" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || !alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [code, orderKey, fileId]);

  if (!url) return <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-gold/5" aria-busy="true" />;
  return (
    <a href={url} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl border border-line bg-ink">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="h-auto w-full object-contain" />
    </a>
  );
}

/** Picks a screenshot and uploads it to the order. */
export function ReceiptUpload({ order, orderKey, onChange, label, primary = true }: Props & { label: string; primary?: boolean }) {
  const { dict } = useI18n();
  const t = dict.order;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      setError(t.errors.tooBig);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      onChange(await api<OrderView>(`/api/orders/${order.code}/receipts`, { method: "POST", form, key: orderKey }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "server";
      setError(t.errors[code as keyof typeof t.errors] ?? t.errors.server);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`btn ${primary ? "btn-primary" : "btn-secondary"} disabled:opacity-60`}>
        <ImageUp className="h-4 w-4" aria-hidden /> {busy ? t.uploadingReceipt : label}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-arcane-bright">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const { dict } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-ink px-3 py-2.5">
      <div className="min-w-0">
        <dt className="text-xs text-cream-muted">{label}</dt>
        <dd className="truncate font-semibold text-cream" dir="ltr">
          {value}
        </dd>
      </div>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(value).then(() => setCopied(true))}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-cream-muted hover:border-gold hover:text-cream"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden /> {copied ? dict.order.copied : dict.order.copyValue}
      </button>
    </div>
  );
}

/** Deposit instructions and the screenshot upload. */
export function PayCard({ order, orderKey, onChange, due }: Props & { due: number }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  const p = siteConfig.payment;
  const hasDetails = Boolean(p.instapay || p.wallet);
  return (
    <ActionCard title={fmt(t.payTitle, { amount: formatMoney(due, locale) })} tone="gold">
      <p className="text-cream/90">{t.payBody}</p>
      {hasDetails ? (
        <dl className="space-y-2">
          {p.instapay ? <CopyValue label={t.instapay} value={p.instapay} /> : null}
          {p.wallet ? <CopyValue label={t.wallet} value={p.wallet} /> : null}
          {p.accountName ? <p className="text-sm text-cream-muted">{fmt(t.accountName, { name: p.accountName })}</p> : null}
        </dl>
      ) : (
        <p className="rounded-lg bg-ink px-3 py-2.5 text-sm text-cream">{fmt(t.payDetailsLater, { phone: order.customer.phone })}</p>
      )}
      <p className="text-sm text-cream-muted">{fmt(t.payReference, { code: order.code })}</p>
      <ReceiptUpload order={order} orderKey={orderKey} onChange={onChange} label={t.uploadReceipt} />
    </ActionCard>
  );
}

/** The latest proof, with approve and ask-for-changes buttons. */
export function ProofCard({ order, orderKey, onChange }: Props) {
  const { dict } = useI18n();
  const t = dict.order;
  const proof = [...order.events].reverse().find((e) => e.type === "proofSent");
  const [changing, setChanging] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (approve: boolean) => {
    if (approve && !window.confirm(t.approveConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api<OrderView>(`/api/orders/${order.code}/proof`, { method: "POST", body: { approve, comment: approve ? "" : comment.trim() }, key: orderKey }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "server";
      setError(t.errors[code as keyof typeof t.errors] ?? t.errors.server);
      setBusy(false);
    }
  };

  return (
    <ActionCard title={t.proofTitle} tone="gold">
      <p className="text-cream/90">{t.proofBody}</p>
      {proof?.note ? <p className="rounded-lg bg-ink px-3 py-2.5 text-sm text-cream">{fmt(t.proofNote, { note: proof.note })}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {(proof?.fileIds ?? []).map((id, i) => (
          <PrivateImage key={id} code={order.code} orderKey={orderKey} fileId={id} alt={fmt(t.proofAlt, { n: i + 1 })} />
        ))}
      </div>
      {changing ? (
        <div className="space-y-3">
          <textarea
            value={comment}
            rows={4}
            maxLength={1000}
            dir="auto"
            placeholder={t.changesPlaceholder}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-line bg-ink px-3 py-2.5 text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none"
          />
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || comment.trim().length < 2} onClick={() => void respond(false)} className="btn btn-primary disabled:opacity-60">
              {busy ? t.sending : t.sendChanges}
            </button>
            <button type="button" disabled={busy} onClick={() => setChanging(false)} className="btn btn-secondary">
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void respond(true)} className="btn btn-primary disabled:opacity-60">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {busy ? t.sending : t.approve}
          </button>
          <button type="button" disabled={busy} onClick={() => setChanging(true)} className="btn btn-secondary">
            <PencilLine className="h-4 w-4" aria-hidden /> {t.requestChanges}
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-arcane-bright">
          {error}
        </p>
      ) : null}
    </ActionCard>
  );
}
