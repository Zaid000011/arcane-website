import type { ReactNode } from "react";
import type { OrderStatus, PaymentStatus } from "@/lib/checkout/types";
import { formatMoney } from "@/i18n/format";

/** Small pieces shared by the admin pages (English only: it's the team's tool). */

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Waiting for deposit",
  designReview: "Design review",
  proofSent: "Proof sent",
  proofApproved: "Proof approved",
  inProduction: "In production",
  qualityCheck: "Quality check",
  shipped: "Shipped",
  readyForPickup: "Ready for pickup",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  receiptSubmitted: "Screenshot to check",
  depositPaid: "Deposit paid",
  paid: "Paid in full",
  refunded: "Refunded",
};

export const ATTENTION_LABEL = { payment: "Check payment", proof: "Send proof", production: "Ready to make" } as const;

export const money = (n: number) => formatMoney(n, "en");

const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "23 Nov 2026, 14:05" in Cairo time. */
export const when = (iso: string) => dateTime.format(new Date(iso));
export const day = (d: Date) => dateOnly.format(d);

/** "01012345678" → "201012345678" for WhatsApp links. */
export function intlPhone(phone: string): string {
  return phone.startsWith("0") ? `20${phone.slice(1)}` : phone.replace(/\D/g, "");
}

export function Badge({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "gold" | "red" | "green" }) {
  const tones = {
    plain: "bg-ink text-cream-muted ring-1 ring-line",
    gold: "bg-gold/15 text-gold-light",
    red: "bg-arcane/70 text-cream",
    green: "bg-emerald-900/50 text-emerald-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={status === "cancelled" ? "red" : status === "delivered" ? "green" : "plain"}>{STATUS_LABEL[status]}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={status === "receiptSubmitted" ? "gold" : status === "paid" ? "green" : status === "refunded" ? "red" : "plain"}>{PAYMENT_LABEL[status]}</Badge>;
}

export function Panel({ title, children, action, highlight }: { title: string; children: ReactNode; action?: ReactNode; highlight?: boolean }) {
  return (
    <section className={`rounded-2xl border p-5 ${highlight ? "border-gold/60 bg-arcane/25" : "border-line bg-ink-2/70"}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-bold text-gold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const inputClass = "w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream-muted/50 focus:border-gold focus:outline-none";
export const smallButton = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-cream hover:border-gold hover:bg-gold/10 disabled:opacity-50";
export const primaryButton = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-light disabled:opacity-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-cream-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-cream-muted/80">{hint}</span> : null}
    </label>
  );
}
