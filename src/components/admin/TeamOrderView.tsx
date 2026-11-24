"use client";

import { ArrowLeft, CheckCircle2, Copy, ImageUp, Link2, MessageCircle, Phone, Printer, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api, whatsappTo } from "@/lib/api-client";
import { can, type AdminUser, type Permission } from "@/lib/admin/roles";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import type { OrderStatus, OrderView } from "@/lib/checkout/types";
import { addWorkingDays } from "@/lib/order/dates";
import type { Attention, OrderNote } from "@/server/orders";
import { TeamOrderItems } from "./TeamOrderItems";
import { ATTENTION_LABEL, Badge, day, Field, inputClass, intlPhone, money, Panel, PaymentBadge, primaryButton, smallButton, STATUS_LABEL, StatusBadge, when } from "./ui";

const ERRORS: Record<string, string> = {
  wrongStatus: "That step isn't possible right now; the order may have moved on. Refresh the page.",
  invalid: "Check what you entered and try again.",
  badType: "Proof images must be PNG, JPG or WEBP.",
  tooBig: "Each image must be under 10 MB.",
  forbidden: "Your role can't do this.",
  unauthorized: "You've been signed out. Sign in again.",
  notFound: "This order no longer exists.",
  network: "Couldn't reach the server. Check the connection and try again.",
  server: "Something went wrong. Try again.",
};

const STEP_BUTTON: Partial<Record<OrderStatus, string>> = {
  designReview: "Start design review",
  inProduction: "Start production",
  qualityCheck: "Move to quality check",
  shipped: "Mark shipped",
  readyForPickup: "Mark ready for pickup",
  delivered: "Mark delivered",
};

interface Props {
  order: OrderView;
  notes: OrderNote[];
  attention: Attention;
  next: OrderStatus[];
  catalog: Catalog;
  user: AdminUser;
}

export function TeamOrderView({ order, notes, attention, next, catalog, user }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = (p: Permission) => can(user.role, p);
  const base = `/api/admin/orders/${order.code}`;

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (e) {
      setError(ERRORS[e instanceof ApiError ? e.code : "server"] ?? ERRORS.server!);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const pieces = order.items.reduce((sum, i) => sum + i.quote.quantity, 0);
  const left = Math.max(order.totals.total - order.payment.paid, 0);
  const dueNow = order.status === "cancelled" ? 0 : Math.max(order.payment.upfront - order.payment.paid, 0);
  const pickup = order.shipping.method === "pickup";
  const lastFeedback = [...order.events].reverse().find((e) => e.type === "changesRequested" || e.type === "proofSent" || e.type === "proofApproved");
  const approvedAt = [...order.events].reverse().find((e) => e.type === "proofApproved")?.at;
  const readyBy = approvedAt ? addWorkingDays(new Date(approvedAt), order.workingDays, catalog.calendar) : null;

  const nextStep = (() => {
    if (order.status === "cancelled") return "This order was cancelled.";
    if (attention === "payment") return "The customer uploaded a payment screenshot. Check that the money arrived in your InstaPay or wallet app, then confirm the amount below.";
    if (attention === "proof")
      return lastFeedback?.type === "changesRequested"
        ? `The customer asked for changes: “${lastFeedback.note}”. Send a new proof below.`
        : "The deposit is in. Prepare the design and send the proof below.";
    if (attention === "production") return "The customer approved the proof. Start production when you're ready.";
    if (order.status === "placed") return `Waiting for the customer to pay the ${money(dueNow)} deposit.`;
    if (order.status === "proofSent") return "Waiting for the customer to approve the proof.";
    if (order.status === "inProduction") return "Being made. Move it to quality check when it's ready.";
    if (order.status === "qualityCheck") return pickup ? "Checked? Mark it ready for pickup and tell the customer." : "Checked? Mark it shipped when the courier takes it.";
    if (order.status === "shipped" || order.status === "readyForPickup") return left > 0 ? `Collect ${money(left)} in cash, confirm it below, then mark it delivered.` : "Mark it delivered when the customer has it.";
    if (order.status === "delivered") return left > 0 ? `Delivered, but ${money(left)} is still unpaid.` : "Delivered and paid. All done.";
    return "";
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-cream-muted hover:text-cream">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All orders
          </Link>
          <h1 className="mt-1 font-display text-4xl tracking-wide uppercase">Order {order.code}</h1>
          <p className="text-sm text-cream-muted">
            Placed {when(order.createdAt)} · {pieces} pieces · {money(order.totals.total)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} />
            {attention ? <Badge tone="gold">{ATTENTION_LABEL[attention]}</Badge> : null}
          </div>
        </div>
        <a href={`/admin/orders/${order.code}/sheet`} target="_blank" rel="noopener" className={smallButton}>
          <Printer className="h-4 w-4" aria-hidden /> Workshop sheet
        </a>
      </div>

      {nextStep ? <p className="rounded-xl border border-gold/40 bg-arcane/30 px-4 py-3 text-cream">{nextStep}</p> : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-arcane/70 px-4 py-3 text-sm text-cream">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <PaymentPanel order={order} attention={attention} left={left} dueNow={dueNow} canConfirm={allowed("orders.payments")} busy={busy} onConfirm={(amount) => run("payment", () => api(`${base}/payments`, { method: "POST", body: { amount } }))} />
          <ProofPanel order={order} attention={attention} canSend={allowed("orders.proofs")} busy={busy} onSend={(form) => run("proof", () => api(`${base}/proofs`, { method: "POST", form }))} />
          <Panel title="Production status" highlight={attention === "production"}>
            <p className="text-sm text-cream-muted">
              Now: <StatusBadge status={order.status} />
              {readyBy && ["proofApproved", "inProduction", "qualityCheck"].includes(order.status) ? <span className="ms-2">Should be ready around {day(readyBy)}.</span> : null}
            </p>
            {allowed("orders.status") ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {next
                  .filter((s) => s !== "cancelled" && STEP_BUTTON[s])
                  .map((s) => (
                    <button key={s} type="button" disabled={Boolean(busy)} onClick={() => void run(`status:${s}`, () => api(`${base}/status`, { method: "POST", body: { status: s } }))} className={primaryButton}>
                      {busy === `status:${s}` ? "Saving…" : STEP_BUTTON[s]}
                    </button>
                  ))}
                {next.includes("cancelled") ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      if (window.confirm(`Cancel order ${order.code}? The customer will see it as cancelled.`)) void run("cancel", () => api(`${base}/status`, { method: "POST", body: { status: "cancelled" } }));
                    }}
                    className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-arcane-bright hover:bg-arcane/40 disabled:opacity-50"
                  >
                    Cancel order
                  </button>
                ) : null}
                {next.length === 0 ? <p className="text-sm text-cream-muted">Nothing to move on: {order.status === "proofSent" ? "the customer needs to answer the proof first." : "this order is finished."}</p> : null}
              </div>
            ) : (
              <p className="mt-2 text-xs text-cream-muted">Your role can&apos;t change the status.</p>
            )}
          </Panel>
          <TeamOrderItems code={order.code} items={order.items} catalog={catalog} />
          <Panel title="History">
            <ol className="space-y-2 text-sm">
              {order.events.map((e, i) => (
                <li key={i} className="grid gap-x-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <span className="text-cream-muted">{when(e.at)}</span>
                  <span className="text-cream">
                    {eventText(e.type, e.note)}
                    {e.actor ? <span className="text-cream-muted"> · {e.actor}</span> : e.type === "placed" || e.type === "receiptUploaded" || e.type === "proofApproved" || e.type === "changesRequested" ? <span className="text-cream-muted"> · customer</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Customer">
            <p className="text-cream" dir="auto">
              {order.customer.name}
            </p>
            <p className="text-sm text-cream-muted">{order.customer.phone}</p>
            {order.customer.email ? <p className="text-sm text-cream-muted">{order.customer.email}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={whatsappTo(intlPhone(order.customer.phone), `Hi ${order.customer.name.split(" ")[0]}, this is Arcane Studios about your order ${order.code}.`)} target="_blank" rel="noopener noreferrer" className={smallButton}>
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
              <a href={`tel:${order.customer.phone}`} className={smallButton}>
                <Phone className="h-4 w-4" aria-hidden /> Call
              </a>
            </div>
          </Panel>
          <Panel title="Delivery">
            <DeliveryLines order={order} catalog={catalog} />
            {order.notes ? (
              <div className="mt-3 rounded-lg bg-ink px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-cream-muted">Customer&apos;s note</p>
                <p className="whitespace-pre-line text-cream" dir="auto">
                  {order.notes}
                </p>
              </div>
            ) : null}
          </Panel>
          {allowed("orders.status") ? <CustomerLinkPanel order={order} base={base} /> : null}
          <NotesPanel notes={notes} canAdd={allowed("orders.notes")} busy={busy} onAdd={(text) => run("note", () => api(`${base}/notes`, { method: "POST", body: { text } }))} />
        </aside>
      </div>
    </div>
  );
}

function eventText(type: string, note: string): ReactNode {
  switch (type) {
    case "placed":
      return "Order placed";
    case "receiptUploaded":
      return "Payment screenshot uploaded";
    case "paymentConfirmed":
      return `Payment of ${money(Number(note))} confirmed`;
    case "proofSent":
      return note ? `Proof sent: “${note}”` : "Proof sent";
    case "proofApproved":
      return "Proof approved";
    case "changesRequested":
      return `Changes asked for: “${note}”`;
    case "status":
      return `Status: ${STATUS_LABEL[note as OrderStatus] ?? note}`;
    default:
      return type;
  }
}

function DeliveryLines({ order, catalog }: { order: OrderView; catalog: Catalog }) {
  const s = order.shipping;
  const gov = catalog.governorates.find((g) => g.id === s.governorateId);
  const lines =
    s.method === "pickup"
      ? ["Pickup from the studio"]
      : s.method === "school"
        ? ["Delivery to school / university", s.school, gov ? tr(gov.name, "en") : "", s.address]
        : ["Home delivery", [s.city, gov ? tr(gov.name, "en") : ""].filter(Boolean).join(", "), s.address];
  return (
    <ul className="space-y-0.5 text-sm">
      {lines.filter(Boolean).map((l, i) => (
        <li key={i} className={i === 0 ? "font-semibold text-cream" : "text-cream-muted"} dir="auto">
          {l}
        </li>
      ))}
      <li className="pt-1 text-cream-muted">Shipping charged: {order.totals.shipping ? money(order.totals.shipping) : "free"}</li>
    </ul>
  );
}

function PaymentPanel({
  order,
  attention,
  left,
  dueNow,
  canConfirm,
  busy,
  onConfirm,
}: {
  order: OrderView;
  attention: Attention;
  left: number;
  dueNow: number;
  canConfirm: boolean;
  busy: string | null;
  onConfirm: (amount: number) => Promise<boolean>;
}) {
  const suggested = dueNow > 0 ? dueNow : left;
  const [amount, setAmount] = useState(String(suggested));
  useEffect(() => setAmount(String(suggested)), [suggested]);
  const receipts = order.files.filter((f) => f.kind === "receipt");
  const value = Math.floor(Number(amount));
  const valid = Number.isFinite(value) && value > 0;

  return (
    <Panel title="Payment" highlight={attention === "payment"}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-cream-muted">Total</dt>
          <dd className="font-semibold text-cream">{money(order.totals.total)}</dd>
        </div>
        <div>
          <dt className="text-cream-muted">Deposit before production</dt>
          <dd className="font-semibold text-cream">{money(order.payment.upfront)}</dd>
        </div>
        <div>
          <dt className="text-cream-muted">Paid so far</dt>
          <dd className="font-semibold text-cream">{money(order.payment.paid)}</dd>
        </div>
        <div>
          <dt className="text-cream-muted">Still to pay</dt>
          <dd className="font-semibold text-gold">{money(left)}</dd>
        </div>
      </dl>

      <h3 className="mt-5 text-sm font-semibold text-cream">Payment screenshots</h3>
      {receipts.length ? (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {receipts.map((f) => (
            <a key={f.id} href={`/api/admin/orders/${order.code}/files/${f.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border border-line bg-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/admin/orders/${order.code}/files/${f.id}`} alt={`Payment screenshot from ${when(f.createdAt)}`} className="h-40 w-full object-contain" />
              <span className="block px-2 py-1 text-xs text-cream-muted">{when(f.createdAt)}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-cream-muted">None uploaded yet.</p>
      )}

      {canConfirm && order.status !== "cancelled" && left > 0 ? (
        <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <Field label="Amount received (EGP)">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={`${inputClass} w-40`} />
          </Field>
          {dueNow > 0 && left !== dueNow ? (
            <button type="button" onClick={() => setAmount(String(dueNow))} className={smallButton}>
              Deposit {money(dueNow)}
            </button>
          ) : null}
          <button type="button" onClick={() => setAmount(String(left))} className={smallButton}>
            Everything left {money(left)}
          </button>
          <button
            type="button"
            disabled={!valid || Boolean(busy)}
            onClick={() => {
              if (window.confirm(`Confirm that ${money(value)} was received for order ${order.code}?`)) void onConfirm(value);
            }}
            className={primaryButton}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {busy === "payment" ? "Saving…" : `Confirm ${valid ? money(value) : ""} received`}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

function ProofPanel({ order, attention, canSend, busy, onSend }: { order: OrderView; attention: Attention; canSend: boolean; busy: string | null; onSend: (form: FormData) => Promise<boolean> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const history = order.events.filter((e) => e.type === "proofSent" || e.type === "changesRequested" || e.type === "proofApproved");
  const canSendNow = canSend && ["placed", "designReview", "proofSent"].includes(order.status);

  const send = async () => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    form.append("note", note.trim());
    if (await onSend(form)) {
      setFiles([]);
      setNote("");
    }
  };

  return (
    <Panel title="Design proof" highlight={attention === "proof"}>
      {history.length ? (
        <ol className="space-y-4">
          {history.map((e, i) => (
            <li key={i} className="text-sm">
              <p className={e.type === "changesRequested" ? "font-semibold text-gold-light" : "text-cream"}>
                {e.type === "proofSent" ? `Proof sent${e.actor ? ` by ${e.actor}` : ""}` : e.type === "proofApproved" ? "Customer approved the proof" : "Customer asked for changes"}
                <span className="font-normal text-cream-muted"> · {when(e.at)}</span>
              </p>
              {e.note ? (
                <p className="mt-0.5 whitespace-pre-line text-cream-muted" dir="auto">
                  “{e.note}”
                </p>
              ) : null}
              {e.fileIds.length ? (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {e.fileIds.map((id) => (
                    <a key={id} href={`/api/admin/orders/${order.code}/files/${id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border border-line bg-ink">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/admin/orders/${order.code}/files/${id}`} alt="Proof image" className="h-28 w-full object-contain" />
                    </a>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-cream-muted">No proof sent yet.</p>
      )}

      {canSendNow ? (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-cream">{history.some((e) => e.type === "proofSent") ? "Send a new proof" : "Send the proof"}</h3>
          {order.status === "placed" ? <p className="text-xs text-gold-light">The deposit isn&apos;t confirmed yet. You can still send the proof.</p> : null}
          <label className={`${smallButton} cursor-pointer`}>
            <ImageUp className="h-4 w-4" aria-hidden /> Choose images (up to 6)
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))} />
          </label>
          {previews.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {previews.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt={`Chosen image ${i + 1}`} className="h-24 w-full rounded-lg border border-line bg-ink object-contain" />
              ))}
            </div>
          ) : null}
          <Field label="Note to the customer (optional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} dir="auto" className={inputClass} placeholder="Check the spelling of the names and the size of the logo." />
          </Field>
          <button type="button" disabled={!files.length || Boolean(busy)} onClick={() => void send()} className={primaryButton}>
            <Send className="h-4 w-4" aria-hidden /> {busy === "proof" ? "Sending…" : "Send proof to the customer"}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

function CustomerLinkPanel({ order, base }: { order: OrderView; base: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const make = async () => {
    if (!window.confirm("Make a new link for this customer? Their old link will stop working.")) return;
    setBusy(true);
    try {
      const { key } = await api<{ key: string }>(`${base}/link`, { method: "POST" });
      setLink(`${window.location.origin}/track/${order.code}#key=${key}`);
    } catch {
      setLink(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Customer's private link">
      <p className="text-sm text-cream-muted">The link is stored scrambled, so it can&apos;t be shown. If the customer lost it, make a new one and send it to them.</p>
      {link ? (
        <div className="mt-3 space-y-2">
          <input readOnly value={link} onFocus={(e) => e.target.select()} className={`${inputClass} text-xs`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))} className={smallButton}>
              <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy"}
            </button>
            <a href={whatsappTo(intlPhone(order.customer.phone), `Here is the link to your Arcane Studios order ${order.code}: ${link}`)} target="_blank" rel="noopener noreferrer" className={smallButton}>
              <MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp
            </a>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => void make()} className={`${smallButton} mt-3`}>
          <Link2 className="h-4 w-4" aria-hidden /> {busy ? "Making…" : "Make a new customer link"}
        </button>
      )}
    </Panel>
  );
}

function NotesPanel({ notes, canAdd, busy, onAdd }: { notes: OrderNote[]; canAdd: boolean; busy: string | null; onAdd: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  return (
    <Panel title="Team notes">
      <p className="-mt-2 mb-3 text-xs text-cream-muted">Only your team sees these.</p>
      {notes.length ? (
        <ul className="space-y-3 text-sm">
          {notes.map((n, i) => (
            <li key={i}>
              <p className="whitespace-pre-line text-cream" dir="auto">
                {n.text}
              </p>
              <p className="text-xs text-cream-muted">
                {n.author} · {when(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-cream-muted">No notes yet.</p>
      )}
      {canAdd ? (
        <div className="mt-4 space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} dir="auto" placeholder="Add a note for the team" aria-label="New team note" className={inputClass} />
          <button
            type="button"
            disabled={!text.trim() || Boolean(busy)}
            onClick={() => void onAdd(text).then((ok) => ok && setText(""))}
            className={smallButton}
          >
            {busy === "note" ? "Saving…" : "Add note"}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
