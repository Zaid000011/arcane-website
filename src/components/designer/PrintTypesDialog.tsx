"use client";

import { Clock, Info } from "lucide-react";
import Link from "next/link";
import { CloseUpCanvas } from "@/components/closeup/CloseUpCanvas";
import { Modal } from "@/components/ui/Modal";
import { tr } from "@/lib/catalog";
import type { Catalog, FabricKind, PrintMethod } from "@/lib/catalog/types";
import { artFrom, closeUpFabric, closeUpSize, sampleArt, useCloseUp } from "@/lib/closeup/client";
import type { DesignSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";

/** Every print method explained, each with a close-up on the customer's own garment color and fabric. */
export function PrintTypesDialog({ open, onClose, catalog, design }: { open: boolean; onClose: () => void; catalog: Catalog; design: DesignSelection }) {
  const { dict } = useI18n();
  const t = dict.designer;
  const product = catalog.products.find((p) => p.id === design.productId);
  const fabric = product?.fabrics.find((f) => f.id === design.fabricId) ?? product?.fabrics[0] ?? { id: "cotton", kind: "cotton" as FabricKind };
  const color = catalog.colors.find((c) => c.id === design.bodyColorId)?.hex ?? "#151515";

  return (
    <Modal open={open} onClose={onClose} title={t.printTypesTitle} closeLabel={t.close} wide>
      <p className="text-sm leading-relaxed text-cream-muted">{t.printTypesIntro}</p>
      <ul className="mt-5 grid gap-3 md:grid-cols-2">
        {catalog.printMethods.map((m) => (
          <MethodCard key={m.id} method={m} fabric={fabric} color={color} />
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Link href="/pricing" target="_blank" className="text-sm font-semibold text-gold hover:text-gold-light">
          {t.seeAllPrices}
        </Link>
        <button type="button" onClick={onClose} className="btn btn-primary">
          {t.close}
        </button>
      </div>
    </Modal>
  );
}

function MethodCard({ method, fabric, color }: { method: PrintMethod; fabric: { id: string; kind: FabricKind }; color: string }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const base = closeUpFabric(method, fabric, color);
  const size = closeUpSize(104, 224);
  const key = `${method.id}|${base.fabricId}|${base.kind}|${base.color}|${size}|sample`;
  const image = useCloseUp(key, async () => ({
    key: `print|${key}`,
    job: { type: "print", methodId: method.id, fabricId: base.fabricId, kind: base.kind, color: base.color, size, art: artFrom(sampleArt(method.id, base.color, size), size) },
  }));
  const { traits } = method;
  const notes = [
    method.fabricKinds?.length === 1 && method.fabricKinds[0] === "cotton" ? t.cottonOnly : null,
    method.lightGarmentsOnly ? t.lightPolyOnly : null,
  ].filter(Boolean);

  return (
    <li className="flex gap-4 rounded-2xl border border-line bg-ink/50 p-4">
      <div className="lens-glass relative h-[6.5rem] w-[6.5rem] shrink-0 overflow-hidden rounded-full">
        <CloseUpCanvas image={image} />
        <span className="lens-glare" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-gold">{tr(method.name, locale)}</h3>
          <span className="shrink-0 text-xs font-semibold text-cream" dir="ltr" title={`${t.priceLevel}: ${t.priceLevels[traits.priceLevel - 1] ?? ""}`}>
            {"$$$".slice(0, traits.priceLevel)}
            <span className="opacity-30">{"$$$".slice(traits.priceLevel)}</span>
          </span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-cream-muted">{tr(method.description, locale)}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-cream-muted">{t.feel}</dt>
          <dd className="text-cream">{tr(traits.feel, locale)}</dd>
          <dt className="text-cream-muted">{t.bestFor}</dt>
          <dd className="text-cream">{tr(traits.bestFor, locale)}</dd>
          <dt className="text-cream-muted">{t.durability}</dt>
          <dd className="flex items-center gap-1" aria-label={fmt(t.durabilityValue, { n: traits.durability })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={`h-1.5 w-4 rounded-full ${n <= traits.durability ? "bg-gold" : "bg-line"}`} aria-hidden />
            ))}
          </dd>
          <dt className="text-cream-muted">{t.minimum}</dt>
          <dd className="text-cream">{method.minQty > 1 ? fmt(t.minPieces, { n: method.minQty }) : t.noMinimum}</dd>
        </dl>
        {notes.length || method.extraDays > 0 ? (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {notes.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded-full bg-arcane/50 px-2 py-0.5 text-[11px] text-cream">
                <Info className="h-3 w-3" aria-hidden /> {n}
              </span>
            ))}
            {method.extraDays > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] text-cream-muted">
                <Clock className="h-3 w-3" aria-hidden /> {fmt(t.extraDays, { n: method.extraDays })}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </li>
  );
}
