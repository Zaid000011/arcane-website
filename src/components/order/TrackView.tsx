"use client";

import { Copy, Link2, MessageCircle, Printer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import { ApiError, api, takeHashParams, whatsappShare, whatsappTo } from "@/lib/api-client";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import type { OrderView } from "@/lib/checkout/types";
import { addWorkingDays, formatDate } from "@/lib/order/dates";
import { myOrders, orderUrl, rememberOrder, rememberedOrderKey, type MyOrder } from "@/lib/order/my-orders";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";
import { ActionCard, PayCard, ProofCard, ReceiptUpload } from "./OrderActions";
import { amountsDue, DeliveryCard, lastEvent, OrderItems, PaymentSummary, Timeline } from "./OrderDetails";

type State = { kind: "loading" } | { kind: "noKey" } | { kind: "error"; message: string } | { kind: "ready"; key: string; order: OrderView };

/** The customer's private order page: what to do next, progress, and everything they ordered. */
export function TrackView({ code, catalog }: { code: string; catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [others, setOthers] = useState<MyOrder[]>([]);

  const load = useCallback(
    async (key: string) => {
      try {
        const order = await api<OrderView>(`/api/orders/${code}`, { key });
        rememberOrder({ code, key, createdAt: order.createdAt, total: order.totals.total });
        setState({ kind: "ready", key, order });
      } catch (e) {
        const c = e instanceof ApiError ? e.code : "server";
        setState({ kind: "error", message: t.errors[c as keyof typeof t.errors] ?? t.errors.server });
      }
    },
    [code, t],
  );

  useEffect(() => {
    const fromLink = takeHashParams().key;
    if (fromLink) {
      // Remember it straight away so a refresh still works after the key leaves the address bar.
      rememberOrder({ code, key: fromLink, createdAt: new Date().toISOString(), total: 0 });
      // Arriving from checkout keeps the old scroll position; start at the top.
      window.scrollTo(0, 0);
    }
    const key = fromLink ?? rememberedOrderKey(code);
    setOthers(myOrders().filter((o) => o.code !== code));
    if (!key) {
      setState({ kind: "noKey" });
      return;
    }
    void load(key);
  }, [code, load]);

  // Check for updates whenever the customer comes back to the tab.
  const key = state.kind === "ready" ? state.key : null;
  useEffect(() => {
    if (!key) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(key);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [key, load]);

  if (state.kind === "loading") {
    return (
      <div className="section min-h-[50vh] py-14 text-cream-muted" aria-busy="true">
        {t.loading}
      </div>
    );
  }

  if (state.kind !== "ready") {
    return (
      <div className="section max-w-2xl py-14">
        <div className="card space-y-3 p-6">
          <h1 className="font-display text-3xl tracking-wide uppercase">{fmt(t.title, { code })}</h1>
          <p className="text-cream">{state.kind === "error" ? state.message : t.needKey}</p>
          {state.kind === "noKey" ? <p className="text-sm text-cream-muted">{t.needKeyHint}</p> : null}
        </div>
        <MyOrdersList orders={others} />
      </div>
    );
  }

  const { order } = state;
  const update = (next: OrderView) => setState({ kind: "ready", key: state.key, order: next });
  const placed = formatDate(new Date(order.createdAt), locale);

  return (
    <div className="section print-plain py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="mt-2 font-display text-4xl tracking-wide uppercase sm:text-5xl">{fmt(t.title, { code: order.code })}</h1>
          <p className="mt-1 text-sm text-cream-muted">{fmt(t.placedOn, { date: placed })}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${order.status === "cancelled" ? "bg-arcane/70 text-cream" : order.status === "delivered" ? "bg-emerald-900/50 text-emerald-200" : "bg-gold/15 text-gold-light"}`}>
          {order.status === "placed" && order.paymentStatus === "receiptSubmitted" ? t.checkingPayment : t.status[order.status]}
        </span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <NextStep order={order} orderKey={state.key} onChange={update} catalog={catalog} />
          <SaveLink code={order.code} orderKey={state.key} />
          <OrderItems order={order} catalog={catalog} />
        </div>
        <aside className="space-y-6">
          <Timeline order={order} />
          <PaymentSummary order={order} />
          <DeliveryCard order={order} catalog={catalog} />
          <div className="no-print flex flex-col gap-2">
            <button type="button" onClick={() => window.print()} className="btn btn-secondary w-full">
              <Printer className="h-4 w-4" aria-hidden /> {t.print}
            </button>
            {siteConfig.whatsappNumber ? (
              <a href={whatsappTo(siteConfig.whatsappNumber, fmt(t.whatsappMessage, { code: order.code }))} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-full">
                <MessageCircle className="h-4 w-4" aria-hidden /> {t.whatsappUs}
              </a>
            ) : null}
          </div>
        </aside>
      </div>
      <div className="no-print">
        <MyOrdersList orders={others} />
      </div>
    </div>
  );
}

/** The one thing the customer should do or know right now. */
function NextStep({ order, orderKey, onChange, catalog }: { order: OrderView; orderKey: string; onChange: (o: OrderView) => void; catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  const money = (n: number) => formatMoney(n, locale);
  const { dueNow, onDelivery } = amountsDue(order);
  const approvedAt = lastEvent(order, (e) => e.type === "proofApproved")?.at;
  const readyDate = formatDate(addWorkingDays(approvedAt ? new Date(approvedAt) : new Date(), order.workingDays, catalog.calendar), locale);
  const props = { order, orderKey, onChange };

  if (order.status === "cancelled") {
    return (
      <ActionCard title={t.cancelledTitle}>
        <p className="text-cream-muted">{t.cancelledBody}</p>
      </ActionCard>
    );
  }
  if (order.status === "proofSent") return <ProofCard {...props} />;
  if (dueNow > 0 && order.paymentStatus === "receiptSubmitted") {
    return (
      <ActionCard title={t.receiptTitle}>
        <p className="text-cream-muted">{t.receiptBody}</p>
        <ReceiptUpload {...props} label={t.uploadAnother} primary={false} />
      </ActionCard>
    );
  }
  if (dueNow > 0 && ["placed", "designReview", "proofApproved"].includes(order.status)) return <PayCard {...props} due={dueNow} />;

  switch (order.status) {
    case "placed":
    case "designReview": {
      const changes = lastEvent(order, (e) => e.type === "changesRequested" || e.type === "proofSent");
      const updating = changes?.type === "changesRequested";
      return (
        <ActionCard title={updating ? t.changesTitle : t.reviewTitle}>
          <p className="text-cream-muted">{updating ? t.changesBody : t.reviewBody}</p>
        </ActionCard>
      );
    }
    case "proofApproved":
      return (
        <ActionCard title={t.approvedTitle}>
          <p className="text-cream-muted">{fmt(t.approvedBody, { days: order.workingDays, date: readyDate })}</p>
        </ActionCard>
      );
    case "inProduction":
    case "qualityCheck":
      return (
        <ActionCard title={t.productionTitle}>
          <p className="text-cream-muted">{fmt(t.productionBody, { date: readyDate })}</p>
        </ActionCard>
      );
    case "shipped":
      return (
        <ActionCard title={t.shippedTitle} tone="gold">
          <p className="text-cream/90">{onDelivery > 0 ? fmt(t.shippedBody, { amount: money(onDelivery) }) : t.shippedBodyPaid}</p>
        </ActionCard>
      );
    case "readyForPickup":
      return (
        <ActionCard title={t.pickupReadyTitle} tone="gold">
          <p className="text-cream/90">{tr(siteConfig.pickupLocation, locale) || t.pickupLater}</p>
          {onDelivery > 0 ? <p className="text-cream/90">{fmt(t.pickupReadyBody, { amount: money(onDelivery) })}</p> : null}
        </ActionCard>
      );
    default:
      return (
        <ActionCard title={t.deliveredTitle}>
          <p className="text-cream-muted">{t.deliveredBody}</p>
        </ActionCard>
      );
  }
}

/** There are no accounts, so the private link is how the customer gets back here. */
function SaveLink({ code, orderKey }: { code: string; orderKey: string }) {
  const { dict } = useI18n();
  const t = dict.order;
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(orderUrl(code, orderKey)), [code, orderKey]);
  return (
    <section className="no-print card space-y-3 p-5" aria-labelledby="save-link-title">
      <h2 id="save-link-title" className="flex items-center gap-2 font-serif text-lg font-bold text-gold">
        <Link2 className="h-5 w-5" aria-hidden /> {t.saveTitle}
      </h2>
      <p className="text-sm text-cream-muted">{t.saveHint}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/50 px-3 py-2 text-sm text-cream hover:border-gold hover:bg-gold/10"
        >
          <Copy className="h-4 w-4" aria-hidden /> {copied ? t.copied : t.copy}
        </button>
        <a
          href={whatsappShare(fmt(t.saveMessage, { code, link: url }))}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-cream-muted hover:border-gold hover:text-cream"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> {t.sendToMe}
        </a>
      </div>
    </section>
  );
}

/** Orders placed from this device (each link includes its private key). */
export function MyOrdersList({ orders }: { orders: MyOrder[] }) {
  const { locale, dict } = useI18n();
  const t = dict.order;
  if (!orders.length) return null;
  return (
    <section className="mt-8" aria-labelledby="my-orders-title">
      <h2 id="my-orders-title" className="font-serif text-lg font-bold text-gold">
        {t.myOrders}
      </h2>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
        {orders.map((o) => (
          <li key={o.code} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-cream">
              {o.code}
              <span className="ms-2 text-cream-muted">{formatDate(new Date(o.createdAt), locale)}</span>
            </span>
            <span className="flex items-center gap-4">
              {o.total ? <span className="text-cream-muted">{formatMoney(o.total, locale)}</span> : null}
              <Link href={`/track/${o.code}`} className="font-semibold text-gold hover:underline">
                {t.view}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
