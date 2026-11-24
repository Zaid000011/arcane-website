"use client";

import { Check, Download, FileText, MessageCircle, Palette, Phone, Ruler, RotateCcw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, whatsappTo } from "@/lib/api-client";
import { requestRef, type RequestKind, type RequestStatus, type RequestView } from "@/lib/requests/types";
import { Badge, inputClass, intlPhone, primaryButton, smallButton, when } from "./ui";

const KIND: Record<RequestKind, { label: string; icon: typeof Upload }> = {
  design: { label: "Their own design", icon: Upload },
  color: { label: "Color request", icon: Palette },
  size: { label: "Custom size", icon: Ruler },
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = { new: "New", contacted: "Contacted", done: "Done" };

const ERRORS: Record<string, string> = {
  forbidden: "Your role can't do this.",
  unauthorized: "You've been signed out. Sign in again.",
  notFound: "This request no longer exists.",
  network: "Couldn't reach the server. Check the connection and try again.",
};

const PREVIEW = ["image/png", "image/jpeg", "image/webp"];
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

interface Props {
  request: RequestView;
  productName: string | null;
  closest: { name: string; hex: string; distance: number } | null;
}

export function RequestCard({ request: r, productName, closest }: Props) {
  const router = useRouter();
  const [note, setNote] = useState(r.teamNote);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const Kind = KIND[r.kind];
  const ref = requestRef(r.code);
  const base = `/api/admin/requests/${r.code}`;

  const patch = async (label: string, body: { status?: RequestStatus; teamNote?: string }) => {
    setBusy(label);
    setError(null);
    try {
      await api(base, { method: "PATCH", body });
      if (body.teamNote !== undefined) setSavedNote(true);
      router.refresh();
    } catch (e) {
      setError(ERRORS[e instanceof ApiError ? e.code : ""] ?? "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const hello =
    r.locale === "ar"
      ? `أهلًا ${r.name}، معك أركين ستوديوز بخصوص طلبك ${ref}.`
      : `Hi ${r.name}, this is Arcane Studios about your request ${ref}.`;

  return (
    <article className={`rounded-2xl border p-5 ${r.status === "new" ? "border-gold/60 bg-arcane/20" : "border-line bg-ink-2/70"}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Kind.icon className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold text-cream">
              {Kind.label} <span className="font-mono text-sm text-gold">{ref}</span>
            </h2>
            <p className="text-xs text-cream-muted">
              {when(r.createdAt)} · {r.locale === "ar" ? "Arabic" : "English"}
            </p>
          </div>
        </div>
        <Badge tone={r.status === "new" ? "gold" : r.status === "done" ? "green" : "plain"}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="me-1 text-cream" dir="auto">
          {r.name}
        </span>
        <span className="font-mono text-sm text-cream-muted">{r.phone}</span>
        <a href={whatsappTo(intlPhone(r.phone), hello)} target="_blank" rel="noopener noreferrer" className={smallButton}>
          <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
        </a>
        <a href={`tel:${r.phone}`} className={smallButton}>
          <Phone className="h-4 w-4" aria-hidden /> Call
        </a>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Item label="Garment" value={productName ?? "Not sure yet"} />
        {r.quantity ? <Item label="About" value={`${r.quantity} pieces`} /> : null}
        {r.size ? <Item label="Pieces in this size" value={String(r.size.count)} /> : null}
      </dl>

      {r.color ? (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-ink/60 p-3">
          <span className="h-12 w-12 shrink-0 rounded-full border border-black/40" style={{ backgroundColor: r.color.hex }} aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-mono font-semibold text-cream">{r.color.hex}</p>
            {r.color.name ? (
              <p className="text-cream-muted" dir="auto">
                {r.color.name}
              </p>
            ) : null}
          </div>
          {closest ? (
            <div className="ms-auto flex items-center gap-2 text-xs text-cream-muted">
              <span className="h-6 w-6 rounded-full border border-black/40" style={{ backgroundColor: closest.hex }} aria-hidden />
              <span>
                Closest in stock: <span className="text-cream">{closest.name}</span> <span className="font-mono">{closest.hex}</span>
                <span className="block">{closest.distance < 6 ? "Very close" : closest.distance < 15 ? "Similar" : "Quite different"}</span>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {r.size ? (
        <table className="mt-4 w-full max-w-sm text-sm">
          <tbody className="divide-y divide-line">
            <Measure label="Chest width (armpit to armpit)" value={r.size.chest} unit="cm" />
            <Measure label="Body length (shoulder to hem)" value={r.size.length} unit="cm" />
            {r.size.sleeve ? <Measure label="Sleeve length" value={r.size.sleeve} unit="cm" /> : null}
            {r.size.height ? <Measure label="Height" value={r.size.height} unit="cm" /> : null}
            {r.size.weight ? <Measure label="Weight" value={r.size.weight} unit="kg" /> : null}
          </tbody>
        </table>
      ) : null}

      {r.message ? (
        <p className="mt-4 rounded-xl border-s-2 border-gold/60 bg-ink/50 px-3 py-2 text-sm whitespace-pre-wrap text-cream" dir="auto">
          {r.message}
        </p>
      ) : null}

      {r.files.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {r.files.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-xl border border-line bg-ink/60">
              {PREVIEW.includes(f.type) ? (
                <a href={`${base}/files/${f.id}`} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-[repeating-conic-gradient(#2a1416_0%_25%,#1c0e10_0%_50%)] bg-[length:16px_16px]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private file behind the team login */}
                  <img src={`${base}/files/${f.id}`} alt={f.name} className="h-full w-full object-contain" loading="lazy" />
                </a>
              ) : (
                <span className="flex aspect-square flex-col items-center justify-center gap-1 text-cream-muted">
                  <FileText className="h-8 w-8" aria-hidden />
                  <span className="text-xs uppercase">{f.name.split(".").pop()}</span>
                </span>
              )}
              <a href={`${base}/files/${f.id}?download`} className="flex items-center gap-1.5 border-t border-line px-2 py-1.5 text-xs text-cream hover:bg-gold/10" title={f.name}>
                <Download className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                <span className="truncate">{f.name}</span>
                <span className="ms-auto shrink-0 text-cream-muted">{kb(f.size)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 space-y-2 border-t border-line pt-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-cream-muted">Team note (only the team sees this)</span>
          <textarea
            value={note}
            rows={2}
            maxLength={2000}
            dir="auto"
            onChange={(e) => {
              setNote(e.target.value);
              setSavedNote(false);
            }}
            placeholder="What you agreed with the customer, prices, next steps…"
            className={inputClass}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy !== null || note.trim() === r.teamNote} onClick={() => void patch("note", { teamNote: note })} className={smallButton}>
            {busy === "note" ? "Saving…" : "Save note"}
          </button>
          {savedNote && note.trim() === r.teamNote ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
              <Check className="h-3.5 w-3.5" aria-hidden /> Saved
            </span>
          ) : null}
          <span className="ms-auto flex flex-wrap gap-2">
            {r.status === "new" ? (
              <button type="button" disabled={busy !== null} onClick={() => void patch("contacted", { status: "contacted" })} className={primaryButton}>
                {busy === "contacted" ? "Saving…" : "Mark contacted"}
              </button>
            ) : null}
            {r.status !== "done" ? (
              <button type="button" disabled={busy !== null} onClick={() => void patch("done", { status: "done" })} className={r.status === "new" ? smallButton : primaryButton}>
                {busy === "done" ? "Saving…" : "Mark done"}
              </button>
            ) : (
              <button type="button" disabled={busy !== null} onClick={() => void patch("reopen", { status: "contacted" })} className={smallButton}>
                <RotateCcw className="h-4 w-4" aria-hidden /> {busy === "reopen" ? "Saving…" : "Reopen"}
              </button>
            )}
          </span>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-arcane-bright">
            {error}
          </p>
        ) : null}
        {r.updatedBy ? (
          <p className="text-xs text-cream-muted">
            Last change by {r.updatedBy}, {when(r.updatedAt)}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-cream-muted">{label}</dt>
      <dd className="text-cream">{value}</dd>
    </div>
  );
}

function Measure({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <tr>
      <td className="py-1.5 pe-4 text-cream-muted">{label}</td>
      <td className="py-1.5 text-end font-semibold text-cream">
        {value} {unit}
      </td>
    </tr>
  );
}
