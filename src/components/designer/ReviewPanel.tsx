"use client";

import { ShoppingBag, Users } from "lucide-react";
import { StartGroupForm } from "@/components/group/StartGroupForm";
import { useMemo, useState, type ReactNode } from "react";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { describeDesign, describeSizes } from "@/lib/design/describe";
import { useDesignStore } from "@/lib/design/store";
import { addWorkingDays, formatDate } from "@/lib/order/dates";
import { effectiveSizes } from "@/lib/order/roster";
import type { DesignSelection, Quote } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { FieldLabel } from "./controls";
import { GarmentImage } from "@/components/three/GarmentImage";

export function ReviewPanel({
  catalog,
  design,
  quote,
  blocking,
  designBlocked,
  editingExisting,
  onAdd,
}: {
  catalog: Catalog;
  design: DesignSelection;
  quote: Quote;
  blocking: boolean;
  /** Problems with the design itself (not quantities), which also stop a group order. */
  designBlocked: boolean;
  editingExisting: boolean;
  onAdd: (asNew: boolean) => void;
}) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const order = useDesignStore((s) => s.order);
  const [showFix, setShowFix] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const info = describeDesign(catalog, design, locale, t);
  const sizes = effectiveSizes(order, design.personalization);
  const speed = catalog.deliverySpeeds.find((s) => s.id === order.deliverySpeedId);
  const date = useMemo(() => addWorkingDays(new Date(), quote.delivery.workingDays, catalog.calendar), [quote.delivery.workingDays, catalog.calendar]);
  const sample = order.roster.find((r) => r.name || r.number);

  const attempt = (asNew: boolean) => {
    if (blocking) {
      setShowFix(true);
      return;
    }
    onAdd(asNew);
  };

  return (
    <div className="space-y-6">
      <FieldLabel>{t.reviewTitle}</FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        {(["front", "back"] as const).map((v) => (
          <figure key={v} className="card p-2">
            <GarmentImage
              catalog={catalog}
              design={design}
              view={v}
              samples={{ name: sample?.name || t.sampleName, number: sample?.number || t.sampleNumber }}
              alt={`${info.garment} · ${v === "front" ? t.front : t.back}`}
              className="h-auto w-full"
            />
            <figcaption className="pb-1 text-center text-xs text-cream-muted">{v === "front" ? t.front : t.back}</figcaption>
          </figure>
        ))}
      </div>

      <dl className="divide-y divide-line rounded-xl border border-line text-sm">
        <Row label={t.summaryGarment}>{info.garment}</Row>
        <Row label={t.summaryColors}>{info.colors.join(" · ")}</Row>
        <Row label={t.summaryPrints}>
          {info.prints.length ? (
            <ul className="space-y-0.5">
              {info.prints.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            t.noPrints
          )}
        </Row>
        <Row label={t.summaryPersonalization}>{info.personalization.length ? info.personalization.join(" · ") : t.none}</Row>
        <Row label={t.summaryQuantity}>
          {fmt(t.piecesTotal, { count: quote.quantity })}
          {quote.quantity ? (
            <span className="block text-cream-muted" dir="ltr">
              {describeSizes(catalog, sizes)}
            </span>
          ) : null}
        </Row>
        <Row label={t.summaryDelivery}>
          {speed ? tr(speed.name, locale) : order.deliverySpeedId} · {fmt(t.estimatedDelivery, { date: formatDate(date, locale) })}
        </Row>
      </dl>

      {showFix && blocking ? (
        <p role="alert" className="rounded-lg bg-arcane/60 px-3 py-2 text-sm text-cream">
          {t.fixFirst}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {editingExisting ? (
          <>
            <button type="button" onClick={() => attempt(false)} className="btn btn-primary">
              <ShoppingBag className="h-4 w-4" aria-hidden /> {t.updateCartItem}
            </button>
            <button type="button" onClick={() => attempt(true)} className="btn btn-secondary">
              {t.addAsNew}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => attempt(false)} className="btn btn-primary">
            <ShoppingBag className="h-4 w-4" aria-hidden /> {t.addToCart}
          </button>
        )}
        <button type="button" aria-expanded={showGroup} onClick={() => setShowGroup((v) => !v)} className="btn btn-secondary">
          <Users className="h-4 w-4" aria-hidden /> {dict.group.startButton}
        </button>
      </div>

      {showGroup ? <StartGroupForm catalog={catalog} design={design} deliverySpeedId={order.deliverySpeedId} designBlocked={designBlocked} /> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold tracking-wide text-cream-muted uppercase">{label}</dt>
      <dd className="text-cream">{children}</dd>
    </div>
  );
}
