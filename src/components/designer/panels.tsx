"use client";

import { BookOpen, Check, ChevronRight, Minus, Palette, Plus, Search, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { isLightHex } from "@/components/garment/color";
import { GarmentImage } from "@/components/three/GarmentImage";
import { sleeveLabels, startingPrice, tierHints, tierLabels, tr } from "@/lib/catalog";
import type { Catalog, Product } from "@/lib/catalog/types";
import { addPrint, defaultDesign, methodBlock, removePrint, switchProduct, updatePrint } from "@/lib/design/logic";
import { isPrintSide, MAX_PRINTS_PER_SIDE, maxTierOf, printBounds, sideNames, sidesFor, sideView, tierLimitCm, type PrintSide } from "@/lib/design/sides";
import { useDesignStore } from "@/lib/design/store";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { fmt, formatDelta, formatMoney } from "@/i18n/format";
import { ArtworkPanel } from "./ArtworkPanel";
import { Choice, FieldLabel } from "./controls";

export interface PanelProps {
  catalog: Catalog;
  design: DesignSelection;
  product: Product;
  /** Apply a change (recorded for undo). Same `coalesce` key in quick succession = one undo step. */
  update: (next: DesignSelection, coalesce?: string) => void;
}

/* ---------- Garment ---------- */

export function GarmentPanel({ catalog, design, product, update }: PanelProps) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const sleeves = (["short", "long"] as const).filter((s) => product.basePrice[s] !== undefined);
  const fits = product.fitIds.map((id) => catalog.fits.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => Boolean(f));

  return (
    <div className="space-y-8">
      <section>
        <FieldLabel>{t.garment}</FieldLabel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {catalog.products
            .filter((p) => p.enabled)
            .map((p) => (
              <Choice key={p.id} selected={p.id === product.id} onSelect={() => update(switchProduct(catalog, design, p.id))} className="flex flex-col items-center p-2">
                <GarmentImage
                  catalog={catalog}
                  design={{ ...defaultDesign(catalog, p.id), bodyColorId: design.bodyColorId }}
                  width={200}
                  height={200}
                  alt={tr(p.name, locale)}
                  className="h-24 w-full object-contain"
                />
                <span className="mt-1 text-sm font-semibold text-cream">{tr(p.name, locale)}</span>
                <span className="text-xs text-gold">{formatMoney(startingPrice(p), locale)}</span>
              </Choice>
            ))}
        </div>
      </section>

      {sleeves.length > 1 ? (
        <section>
          <FieldLabel>{t.sleeve}</FieldLabel>
          <div className="grid grid-cols-2 gap-3">
            {sleeves.map((s) => (
              <Choice key={s} selected={design.sleeve === s} onSelect={() => update({ ...design, sleeve: s, prints: design.prints })}>
                <span className="block font-semibold text-cream">{tr(sleeveLabels[s], locale)}</span>
                <span className="text-xs">{formatMoney(product.basePrice[s]!, locale)}</span>
              </Choice>
            ))}
          </div>
        </section>
      ) : null}

      {fits.length > 1 ? (
        <section>
          <FieldLabel>{t.fit}</FieldLabel>
          <div className="grid grid-cols-3 gap-3">
            {fits.map((fit) => (
              <Choice key={fit.id} selected={design.fitId === fit.id} onSelect={() => update({ ...design, fitId: fit.id })}>
                <span className="block font-semibold text-cream">{tr(fit.name, locale)}</span>
                <span className="text-xs">{formatDelta(fit.priceDelta, locale)}</span>
              </Choice>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ---------- Fabric ---------- */

export function FabricPanel({ design, product, update }: PanelProps) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  return (
    <div className="space-y-8">
      <section>
        <FieldLabel>{t.gsm}</FieldLabel>
        <p className="-mt-1 mb-3 text-xs leading-relaxed text-cream-muted">{t.gsmHint}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {product.gsmOptions.map((g) => (
            <Choice key={g.gsm} selected={design.gsm === g.gsm} onSelect={() => update({ ...design, gsm: g.gsm })} className="flex items-center justify-between gap-3">
              <span>
                {/* The plain-words description leads: most people don't know what GSM means. */}
                <span className="block font-bold text-cream">{tr(g.description, locale)}</span>
                <span className="text-xs" dir="ltr">{g.gsm} GSM</span>
              </span>
              <span className="shrink-0 text-xs text-gold">{formatDelta(g.priceDelta, locale)}</span>
            </Choice>
          ))}
        </div>
      </section>

      <section>
        <FieldLabel>{t.fabricType}</FieldLabel>
        <p className="-mt-1 mb-3 flex items-center gap-1.5 text-xs text-cream-muted">
          <Search className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden /> {t.fabricHint}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {product.fabrics.map((f) => (
            <Choice key={f.id} selected={design.fabricId === f.id} onSelect={() => update({ ...design, fabricId: f.id })}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-cream">{tr(f.name, locale)}</span>
                {f.priceDelta !== 0 ? <span className="shrink-0 text-xs text-gold">{formatDelta(f.priceDelta, locale)}</span> : null}
              </span>
              {f.description ? <span className="mt-0.5 block text-xs">{tr(f.description, locale)}</span> : null}
            </Choice>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------- Colors ---------- */

/** One color for the whole garment (separate colors for hood lining, strings, cuffs… were removed on request). */
export function ColorsPanel({ catalog, design, update, onSendColor }: PanelProps & { onSendColor: () => void }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const bodyColor = catalog.colors.find((c) => c.id === design.bodyColorId);

  return (
    <div className="space-y-8">
      <section>
        <FieldLabel hint={bodyColor ? <span>{tr(bodyColor.name, locale)} · <span dir="ltr" className="font-mono">{bodyColor.hex.toUpperCase()}</span></span> : undefined}>
          {t.bodyColor}
        </FieldLabel>
        <p className="-mt-1 mb-3 text-xs text-cream-muted">{t.colorCodeHint}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {catalog.colors.map((c) => {
            const selected = design.bodyColorId === c.id;
            const name = tr(c.name, locale);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                disabled={!c.inStock}
                aria-label={`${name} ${c.hex.toUpperCase()}${c.inStock ? "" : ` (${t.outOfStock})`}`}
                onClick={() => update({ ...design, bodyColorId: c.id })}
                className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected ? "border-gold bg-gold/10" : "border-line bg-ink-2/60 hover:border-gold/50"
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/40 ${selected ? "ring-2 ring-gold ring-offset-2 ring-offset-ink" : ""}`}
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                >
                  {selected ? <Check className={`h-4 w-4 ${isLightHex(c.hex) ? "text-ink" : "text-cream"}`} /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-tight font-semibold text-cream">{name}</span>
                  <span className="block font-mono text-[11px] tracking-wide text-cream-muted" dir="ltr">
                    {c.inStock ? c.hex.toUpperCase() : t.outOfStock}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <SendItButton icon={Palette} onClick={onSendColor}>
          {dict.send.colorButton}
        </SendItButton>
      </section>
    </div>
  );
}

/** Dashed "can't find it? send it to us" button under a list of choices. */
export function SendItButton({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold/50 px-4 py-3 text-sm font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-light"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </button>
  );
}

/* ---------- Prints ---------- */

const cm = (mm: number) => Math.round(mm / 10);

export function PrintsPanel({
  catalog,
  design,
  product,
  update,
  onFocusPrint,
  onExplainPrints,
}: PanelProps & { onFocusPrint: (printId: string) => void; onExplainPrints: () => void }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const selection = useDesignStore((s) => s.selection);
  const select = useDesignStore((s) => s.select);
  const setView = useDesignStore((s) => s.setView);
  const sides = sidesFor(product.mockup);
  const picked = design.prints.find((p) => p.id === selection?.printId);
  const firstSide = design.prints.find((p) => isPrintSide(p.areaId))?.areaId;
  const [side, setSide] = useState<PrintSide>(() => (picked && isPrintSide(picked.areaId) ? picked.areaId : firstSide && isPrintSide(firstSide) ? firstSide : "front"));
  // Follow the chosen print to its side (it can be picked from the garment view too).
  useEffect(() => {
    if (picked && isPrintSide(picked.areaId)) setSide(picked.areaId);
  }, [picked?.id, picked?.areaId]);
  const shown: PrintSide = sides.includes(side) ? side : "front";
  const onSide = design.prints.filter((p) => p.areaId === shown);
  const current = picked && picked.areaId === shown ? picked : onSide[0];
  const sideLabel = tr(sideNames[shown], locale);
  const sideLower = locale === "en" ? sideLabel.toLowerCase() : sideLabel;

  const chooseSide = (next: PrintSide) => {
    setSide(next);
    setView(sideView(next));
    const first = design.prints.find((p) => p.areaId === next);
    select(first ? { printId: first.id, elementId: null } : null);
  };
  const add = () => {
    const r = addPrint(catalog, design, shown);
    if (!r.printId) return;
    update(r.design);
    onFocusPrint(r.printId);
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onExplainPrints}
        aria-haspopup="dialog"
        className="group flex w-full items-center gap-3 rounded-2xl border border-gold/60 bg-[linear-gradient(120deg,rgba(122,10,10,0.55),rgba(74,18,24,0.35))] p-4 text-start transition-colors hover:border-gold hover:bg-arcane/60"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold text-ink">
          <BookOpen className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-cream">{t.printTypesButton}</span>
          <span className="block text-sm text-gold-light">{t.printTypesButtonHint}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gold transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden />
      </button>
      <p className="text-sm text-cream-muted">{t.printsHint}</p>

      <div role="tablist" aria-label={t.printSides} className="flex flex-wrap gap-2">
        {sides.map((sd) => {
          const count = design.prints.filter((p) => p.areaId === sd).length;
          return (
            <button
              key={sd}
              type="button"
              role="tab"
              aria-selected={shown === sd}
              onClick={() => chooseSide(sd)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-semibold text-cream-muted transition-colors hover:border-gold/60 hover:text-cream aria-selected:border-gold aria-selected:bg-gold aria-selected:text-ink"
            >
              {tr(sideNames[sd], locale)}
              {count ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink/80 px-1 text-xs text-gold">{count}</span> : null}
            </button>
          );
        })}
      </div>

      {onSide.length ? (
        <ul className="space-y-2">
          {onSide.map((p, i) => {
            const method = catalog.printMethods.find((m) => m.id === p.methodId);
            const b = printBounds(p.elements);
            const colors = method?.pricedPerColor ? Math.max(1, p.colorCount ?? 1) : 1;
            const price = method?.prices[p.tier];
            const isCurrent = current?.id === p.id;
            return (
              <li key={p.id} id={`print-${p.id}`} className={`rounded-xl border p-3 transition-colors ${isCurrent ? "border-gold/60 bg-gold/5" : "border-line"}`}>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => onFocusPrint(p.id)} aria-pressed={isCurrent}>
                    <span className="block font-semibold text-cream">
                      {fmt(t.printN, { n: i + 1 })} · {method ? tr(method.name, locale) : p.methodId}
                    </span>
                    <span className="text-xs text-cream-muted">
                      {b ? <span dir="ltr">{cm(b.w)} × {cm(b.h)} cm · </span> : null}
                      {tr(tierLabels[p.tier], locale)}
                      {price !== undefined ? ` · ${formatMoney(price * colors, locale)}` : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update(removePrint(design, p.id));
                      if (isCurrent) select(null);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-cream-muted hover:border-gold hover:text-gold"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden /> {t.remove}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-cream-muted">{fmt(t.noPrintsOnSide, { side: sideLower })}</p>
      )}

      {onSide.length < MAX_PRINTS_PER_SIDE ? (
        <button type="button" onClick={add} className="btn btn-primary w-full py-3">
          <Plus className="h-4 w-4" aria-hidden /> {fmt(onSide.length ? t.addAnotherPrintOn : t.addPrintOn, { side: sideLower })}
        </button>
      ) : (
        <p className="text-xs text-cream-muted">{fmt(t.sideFull, { max: MAX_PRINTS_PER_SIDE })}</p>
      )}

      {current ? <PrintSettings key={current.id} catalog={catalog} design={design} print={current} update={update} /> : null}
    </div>
  );
}

/** Print type, ink colors, size and artwork for one print. */
function PrintSettings({ catalog, design, print, update }: { catalog: Catalog; design: DesignSelection; print: PrintSelection; update: PanelProps["update"] }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const method = catalog.printMethods.find((m) => m.id === print.methodId);
  const b = printBounds(print.elements);
  const max = method ? maxTierOf(method) : "L";
  const limit = tierLimitCm(max);

  return (
    <div className="space-y-4 rounded-xl border border-gold/40 p-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-cream-muted">{t.method}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {catalog.printMethods.map((m) => {
            const block = methodBlock(catalog, design, m.id);
            const price = m.prices[print.tier];
            const tooBig = price === undefined;
            return (
              <Choice
                key={m.id}
                selected={print.methodId === m.id}
                muted={Boolean(block)}
                onSelect={() => update(updatePrint(catalog, design, print.id, { methodId: m.id }))}
                className="px-2.5 py-2"
              >
                <span className="block text-sm font-semibold text-cream">{tr(m.name, locale)}</span>
                <span className="text-xs">
                  {block
                    ? block === "fabric"
                      ? t.unavailableFabric
                      : t.unavailableColor
                    : tooBig
                      ? fmt(t.methodUpTo, { size: tr(tierLabels[maxTierOf(m)], locale) })
                      : `${formatMoney(price, locale)}${m.pricedPerColor ? ` / ${dict.pricing.perColor}` : ""}`}
                </span>
              </Choice>
            );
          })}
        </div>
      </div>

      {method?.pricedPerColor ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-cream-muted">{t.inkColors}</p>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t.decreaseColors} onClick={() => update(updatePrint(catalog, design, print.id, { colorCount: (print.colorCount ?? 1) - 1 }))} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line hover:border-gold">
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="w-6 text-center font-semibold" aria-live="polite">{print.colorCount ?? 1}</span>
            <button type="button" aria-label={t.increaseColors} onClick={() => update(updatePrint(catalog, design, print.id, { colorCount: (print.colorCount ?? 1) + 1 }))} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line hover:border-gold">
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg bg-ink/60 px-3 py-2 text-xs leading-relaxed text-cream-muted">
        <p>
          <span className="font-semibold text-cream">{t.printSize}: </span>
          {b ? <span dir="ltr">{cm(b.w)} × {cm(b.h)} cm · </span> : null}
          {tr(tierLabels[print.tier], locale)} ({tr(tierHints[print.tier], locale)})
        </p>
        {method && limit ? <p>{fmt(t.methodMax, { method: tr(method.name, locale), size: `${limit[0]} × ${limit[1]} cm` })}</p> : null}
        <p>{t.priceFollowsSize}</p>
      </div>

      <ArtworkPanel catalog={catalog} design={design} print={print} update={update} />
    </div>
  );
}
