"use client";

import { AlertTriangle, Copy, Pencil, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MyOrdersList } from "@/components/order/TrackView";
import { GarmentImage } from "@/components/three/GarmentImage";
import { useCartReady, useCartStore, type CartItem } from "@/lib/cart/store";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { priceItem } from "@/lib/checkout/plan";
import { describeDesign, describeSizes } from "@/lib/design/describe";
import { useDesignStore } from "@/lib/design/store";
import { addWorkingDays, formatDate } from "@/lib/order/dates";
import { myOrders, type MyOrder } from "@/lib/order/my-orders";
import { effectiveSizes } from "@/lib/order/roster";
import type { quote as priceQuote } from "@/lib/pricing/engine";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";

export function CartView({ catalog }: { catalog: Catalog }) {
  const { locale, dict } = useI18n();
  const t = dict.cart;
  const ready = useCartReady();
  const items = useCartStore((s) => s.items);
  const quotes = useMemo(() => items.map((item) => ({ item, ...priceItem(catalog, item.design, item.order) })), [catalog, items]);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  useEffect(() => setOrders(myOrders()), []);

  if (!ready) return <div className="section min-h-[50vh] py-14" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <div className="section py-14">
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <ShoppingBag className="h-12 w-12 text-gold" aria-hidden />
          <h1 className="mt-4 font-display text-4xl tracking-wide uppercase">{t.title}</h1>
          <p className="mt-2 text-cream-muted">{t.empty}</p>
          <Link href="/design" className="btn btn-primary mt-6">
            {t.emptyCta}
          </Link>
        </div>
        <div className="mx-auto max-w-2xl">
          <MyOrdersList orders={orders} />
        </div>
      </div>
    );
  }

  const piecesTotal = quotes.reduce((sum, q) => sum + q.quote.total, 0);
  const anyBlocking = quotes.some((q) => q.blocking);

  return (
    <div className="section py-10">
      <h1 className="font-display text-4xl tracking-wide uppercase sm:text-5xl">{t.title}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="space-y-5">
          {quotes.map(({ item, design, quote, blocking }) => (
            <li key={item.id}>
              <CartItemCard catalog={catalog} item={item} design={design} quote={quote} blocking={blocking} />
            </li>
          ))}
        </ul>

        <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-20" aria-labelledby="summary-title">
          <h2 id="summary-title" className="font-serif text-lg font-bold text-gold">
            {t.summaryTitle}
          </h2>
          <dl className="space-y-2 text-sm">
            {quotes.map(({ item, design, quote }) => {
              const product = catalog.products.find((p) => p.id === design.productId);
              return (
                <div key={item.id} className="flex justify-between gap-4">
                  <dt className="text-cream-muted">
                    {product ? tr(product.name, locale) : design.productId} · {fmt(t.pieces, { count: quote.quantity })}
                  </dt>
                  <dd className="text-cream">{formatMoney(quote.total, locale)}</dd>
                </div>
              );
            })}
            <div className="flex justify-between gap-4 border-t border-line pt-3 text-base">
              <dt className="font-semibold text-cream">{t.total}</dt>
              <dd className="font-display text-2xl tracking-wide text-gold">{formatMoney(piecesTotal, locale)}</dd>
            </div>
          </dl>
          <p className="text-xs text-cream-muted">{t.shippingNote}</p>
          {anyBlocking ? (
            <p className="flex items-center gap-2 rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {t.checkoutBlocked}
            </p>
          ) : (
            <Link href="/checkout" className="btn btn-primary w-full py-3.5 text-base">
              {t.checkout}
            </Link>
          )}
          <Link href="/design" className="btn btn-secondary w-full">
            {t.designAnother}
          </Link>
        </aside>
      </div>
      <MyOrdersList orders={orders} />
    </div>
  );
}

function CartItemCard({
  catalog,
  item,
  design,
  quote,
  blocking,
}: {
  catalog: Catalog;
  item: CartItem;
  design: CartItem["design"];
  quote: ReturnType<typeof priceQuote>;
  blocking: boolean;
}) {
  const { locale, dict } = useI18n();
  const t = dict.cart;
  const router = useRouter();
  const duplicate = useCartStore((s) => s.duplicate);
  const remove = useCartStore((s) => s.remove);
  const info = describeDesign(catalog, design, locale, dict.designer);
  const sizes = effectiveSizes(item.order, design.personalization);
  const speed = catalog.deliverySpeeds.find((s) => s.id === item.order.deliverySpeedId);
  const date = addWorkingDays(new Date(), quote.delivery.workingDays, catalog.calendar);
  const sample = item.order.roster.find((r) => r.name || r.number);
  const money = (n: number) => formatMoney(n, locale);

  const edit = async () => {
    // Load the saved designer state first so this change is allowed to be saved.
    await useDesignStore.persist.rehydrate();
    useDesignStore.setState({
      design: structuredClone(item.design),
      order: structuredClone(item.order),
      editingCartItemId: item.id,
      step: "review",
      past: [],
      future: [],
      selection: null,
      zoomed: false,
    });
    router.push("/design");
  };

  return (
    <article className="card grid gap-5 p-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:p-5">
      <div className="grid grid-cols-2 gap-2">
        {(["front", "back"] as const).map((v) => (
          <GarmentImage
            key={v}
            catalog={catalog}
            design={design}
            view={v}
            width={320}
            height={360}
            samples={{ name: sample?.name || dict.designer.sampleName, number: sample?.number || dict.designer.sampleNumber }}
            alt={`${info.garment} · ${v === "front" ? t.front : t.back}`}
            className="h-auto w-full rounded-lg bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,39,0.12),transparent_65%)]"
          />
        ))}
      </div>

      <div className="min-w-0 space-y-3">
        <div>
          <h2 className="font-serif text-lg font-bold text-cream">{info.garment}</h2>
          <p className="text-sm text-cream-muted">{info.colors.join(" · ")}</p>
        </div>
        {info.prints.length ? (
          <ul className="text-sm text-cream-muted">
            {info.prints.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {info.personalization.length ? <p className="text-sm text-cream-muted">{info.personalization.join(" · ")}</p> : null}
        <p className="text-sm text-cream">
          {fmt(t.pieces, { count: quote.quantity })}
          {quote.quantity ? (
            <span className="block text-cream-muted" dir="ltr">
              {describeSizes(catalog, sizes)}
            </span>
          ) : null}
        </p>
        <p className="text-sm text-cream-muted">{fmt(t.delivery, { speed: speed ? tr(speed.name, locale) : "", date: formatDate(date, locale) })}</p>

        {blocking ? (
          <p className="flex items-center gap-2 rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {t.hasErrors}
          </p>
        ) : null}

        <dl className="space-y-1 border-t border-line pt-3 text-sm">
          {quote.quantity ? (
            <div className="flex justify-between gap-4">
              <dt className="text-cream-muted">{fmt(t.perPiece, { amount: money(quote.unitPrice) })}</dt>
              <dd className="text-cream">{money(quote.itemsTotal)}</dd>
            </div>
          ) : null}
          {quote.setupTotal > 0 && quote.quantity ? (
            <div className="flex justify-between gap-4">
              <dt className="text-cream-muted">{t.oneTime}</dt>
              <dd className="text-cream">{money(quote.setupTotal)}</dd>
            </div>
          ) : null}
          {quote.delivery.fee > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-cream-muted">{t.deliveryFee}</dt>
              <dd className="text-cream">{money(quote.delivery.fee)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 font-semibold">
            <dt className="text-cream">{t.itemTotal}</dt>
            <dd className="text-gold">{money(quote.total)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => void edit()} className="inline-flex items-center gap-1.5 rounded-lg border border-gold/50 px-3 py-2 text-sm text-cream hover:border-gold hover:bg-gold/10">
            <Pencil className="h-4 w-4" aria-hidden /> {t.edit}
          </button>
          <button type="button" onClick={() => duplicate(item.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-cream-muted hover:border-gold hover:text-cream">
            <Copy className="h-4 w-4" aria-hidden /> {t.duplicate}
          </button>
          <button type="button" onClick={() => remove(item.id)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-cream-muted hover:bg-arcane hover:text-cream">
            <Trash2 className="h-4 w-4" aria-hidden /> {t.remove}
          </button>
        </div>
      </div>
    </article>
  );
}
