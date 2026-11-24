"use client";

import { Check } from "lucide-react";
import { GarmentImage } from "@/components/three/GarmentImage";
import { siteConfig } from "@/config/site";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import type { OrderEvent, OrderStatus, OrderView } from "@/lib/checkout/types";
import { describeDesign, describeSizes } from "@/lib/design/describe";
import { formatDate } from "@/lib/order/dates";
import { effectiveSizes, needsRoster } from "@/lib/order/roster";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";

const RANK: Record<OrderStatus, number> = {
  placed: 0,
  designReview: 1,
  proofSent: 2,
  proofApproved: 3,
  inProduction: 4,
  qualityCheck: 5,
  shipped: 6,
  readyForPickup: 6,
  delivered: 7,
  cancelled: -1,
};

/** When an event last happened, e.g. the latest approval. */
export function lastEvent(order: OrderView, match: (e: OrderEvent) => boolean): OrderEvent | undefined {
  return [...order.events].reverse().find(match);
}

/** Money still owed: what's due before production and what's left for delivery. */
export function amountsDue(order: OrderView) {
  const dueNow = order.status === "cancelled" ? 0 : Math.max(order.payment.upfront - order.payment.paid, 0);
  const left = Math.max(order.totals.total - order.payment.paid, 0);
  return { dueNow, onDelivery: order.status === "cancelled" ? 0 : left - dueNow };
}

export function Timeline({ order }: { order: OrderView }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  const rank = RANK[order.status];
  const pickup = order.shipping.method === "pickup";
  const statusAt = (...names: OrderStatus[]) => lastEvent(order, (e) => e.type === "status" && names.includes(e.note as OrderStatus))?.at;

  const steps: { id: string; label: string; done: boolean; at?: string }[] = [
    { id: "placed", label: t.stepPlaced, done: true, at: order.createdAt },
    ...(order.payment.upfront > 0
      ? [
          {
            id: "deposit",
            label: order.payment.onDelivery === 0 ? t.stepPaid : t.stepDeposit,
            done: order.payment.paid >= order.payment.upfront,
            at: lastEvent(order, (e) => e.type === "paymentConfirmed")?.at,
          },
        ]
      : []),
    { id: "proof", label: t.stepProof, done: rank >= RANK.proofApproved, at: lastEvent(order, (e) => e.type === "proofApproved")?.at },
    { id: "production", label: t.stepProduction, done: rank >= RANK.inProduction, at: statusAt("inProduction") },
    { id: "ready", label: pickup ? t.stepPickup : t.stepShipped, done: rank >= RANK.shipped, at: statusAt("shipped", "readyForPickup") },
    { id: "delivered", label: t.stepDelivered, done: rank >= RANK.delivered, at: statusAt("delivered") },
  ];
  const current = order.status === "cancelled" ? -1 : steps.findIndex((s) => !s.done);

  return (
    <section className="card p-5" aria-labelledby="timeline-title">
      <h2 id="timeline-title" className="font-serif text-lg font-bold text-gold">
        {t.timelineTitle}
      </h2>
      <ol className="mt-4 space-y-0">
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 ? <span className={`absolute start-[0.6875rem] top-6 h-[calc(100%-1.25rem)] w-px ${s.done ? "bg-gold/60" : "bg-line"}`} aria-hidden /> : null}
            <span
              className={`relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${s.done ? "border-gold bg-gold text-ink" : i === current ? "border-gold bg-arcane text-gold" : "border-line bg-ink text-cream-muted"}`}
              aria-hidden
            >
              {s.done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm ${s.done || i === current ? "font-semibold text-cream" : "text-cream-muted"}`}>
                {s.label}
                <span className="sr-only"> · {s.done ? t.stepDone : i === current ? t.stepNow : t.stepLater}</span>
              </p>
              {s.done && s.at ? <p className="text-xs text-cream-muted">{formatDate(new Date(s.at), locale)}</p> : null}
            </div>
          </li>
        ))}
        {order.status === "cancelled" ? <li className="mt-3 text-sm font-semibold text-arcane-bright">{t.status.cancelled}</li> : null}
      </ol>
    </section>
  );
}

export function PaymentSummary({ order }: { order: OrderView }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  const money = (n: number) => formatMoney(n, locale);
  const { dueNow, onDelivery } = amountsDue(order);
  const pickup = order.shipping.method === "pickup";
  return (
    <section className="card p-5" aria-labelledby="payment-title">
      <h2 id="payment-title" className="font-serif text-lg font-bold text-gold">
        {t.paymentTitle}
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Line label={t.itemsTotal} value={money(order.totals.items)} />
        <Line label={t.shipping} value={order.totals.shipping === 0 ? t.free : money(order.totals.shipping)} />
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
          <dt className="font-semibold text-cream">{t.total}</dt>
          <dd className="font-display text-2xl tracking-wide text-gold">{money(order.totals.total)}</dd>
        </div>
        {order.payment.paid > 0 ? <Line label={t.paid} value={money(order.payment.paid)} /> : null}
        {dueNow > 0 ? <Line label={t.dueNow} value={money(dueNow)} strong /> : null}
        {onDelivery > 0 ? <Line label={pickup ? t.dueAtPickup : t.dueOnDelivery} value={money(onDelivery)} /> : null}
      </dl>
    </section>
  );
}

export function DeliveryCard({ order, catalog }: { order: OrderView; catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  const s = order.shipping;
  const governorate = catalog.governorates.find((g) => g.id === s.governorateId);
  const place = tr(siteConfig.pickupLocation, locale);
  const lines =
    s.method === "pickup"
      ? [t.methodPickup, place || t.pickupLater]
      : s.method === "school"
        ? [t.methodSchool, s.school, governorate ? tr(governorate.name, locale) : "", s.address]
        : [t.methodDelivery, [s.city, governorate ? tr(governorate.name, locale) : ""].filter(Boolean).join(", "), s.address];
  return (
    <section className="card space-y-4 p-5" aria-labelledby="delivery-title">
      <div>
        <h2 id="delivery-title" className="font-serif text-lg font-bold text-gold">
          {t.deliveryTitle}
        </h2>
        <ul className="mt-2 space-y-0.5 text-sm">
          {lines.filter(Boolean).map((line, i) => (
            <li key={i} className={i === 0 ? "font-semibold text-cream" : "text-cream-muted"} dir="auto">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-cream">{t.contactTitle}</h3>
        <ul className="mt-1 space-y-0.5 text-sm text-cream-muted">
          <li dir="auto">{order.customer.name}</li>
          <li dir="ltr" className="text-start">
            {order.customer.phone}
          </li>
          {order.customer.email ? (
            <li dir="ltr" className="text-start">
              {order.customer.email}
            </li>
          ) : null}
        </ul>
      </div>
      {order.notes ? (
        <div>
          <h3 className="text-sm font-semibold text-cream">{t.notesTitle}</h3>
          <p className="mt-1 text-sm whitespace-pre-line text-cream-muted" dir="auto">
            {order.notes}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function OrderItems({ order, catalog }: { order: OrderView; catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="items-title">
      <h2 id="items-title" className="font-serif text-lg font-bold text-gold">
        {t.itemsTitle}
      </h2>
      <ul className="mt-4 space-y-6">
        {order.items.map((item) => {
          const info = describeDesign(catalog, item.design, locale, dict.designer);
          const sizes = effectiveSizes(item.order, item.design.personalization);
          const people = needsRoster(item.design.personalization) ? item.order.roster : [];
          const sample = people.find((r) => r.name || r.number);
          return (
            <li key={item.id} className="grid gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
              <div className="grid grid-cols-2 gap-2">
                {(["front", "back"] as const).map((v) => (
                  <GarmentImage
                    key={v}
                    catalog={catalog}
                    design={item.design}
                    view={v}
                    width={300}
                    height={340}
                    samples={{ name: sample?.name || dict.designer.sampleName, number: sample?.number || dict.designer.sampleNumber }}
                    alt={`${info.garment} · ${v === "front" ? dict.cart.front : dict.cart.back}`}
                    className="h-auto w-full rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,39,0.12),transparent_65%)]"
                  />
                ))}
              </div>
              <div className="min-w-0 space-y-2 text-sm">
                <p className="font-serif text-base font-bold text-cream">{info.garment}</p>
                <p className="text-cream-muted">{info.colors.join(" · ")}</p>
                {info.prints.length ? (
                  <ul className="text-cream-muted">
                    {info.prints.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {info.personalization.length ? <p className="text-cream-muted">{info.personalization.join(" · ")}</p> : null}
                <p className="text-cream">
                  {fmt(dict.cart.pieces, { count: item.quote.quantity })}
                  <span className="block text-cream-muted" dir="ltr">
                    {describeSizes(catalog, sizes)}
                  </span>
                </p>
                {people.length ? (
                  <details className="rounded-lg bg-ink px-3 py-2">
                    <summary className="cursor-pointer text-cream">{fmt(t.peopleList, { count: people.length })}</summary>
                    <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-cream-muted">
                      {people.map((p) => (
                        <li key={p.id} className="flex justify-between gap-3">
                          <span dir="auto">{p.name || "—"}</span>
                          <span dir="ltr">
                            {p.number ? `#${p.number} · ` : ""}
                            {catalog.sizes.find((s) => s.id === p.sizeId)?.label ?? p.sizeId}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <p className="flex justify-between gap-4 border-t border-line pt-2 font-semibold">
                  <span className="text-cream">{t.itemTotal}</span>
                  <span className="text-gold">{formatMoney(item.quote.total, locale)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-semibold text-cream" : "text-cream-muted"}>{label}</dt>
      <dd className={strong ? "font-semibold text-gold-light" : "text-cream"}>{value}</dd>
    </div>
  );
}
