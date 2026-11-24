"use client";

import { BookOpen, Check, ChevronRight, Minus, Palette, Plus, Search, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { isLightHex } from "@/components/garment/color";
import { GarmentImage } from "@/components/three/GarmentImage";
import { sleeveLabels, startingPrice, tierHints, tierLabels, tr } from "@/lib/catalog";
import type { Catalog, Product } from "@/lib/catalog/types";
import { areaSide } from "@/lib/design/areas";
import { allowedTiers, defaultDesign, methodBlock, switchProduct, togglePrint, updatePrint } from "@/lib/design/logic";
import type { DesignSelection } from "@/lib/pricing/types";
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

export function PrintsPanel({
  catalog,
  design,
  product,
  update,
  onFocusArea,
  onExplainPrints,
}: PanelProps & { onFocusArea: (areaId: string) => void; onExplainPrints: () => void }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const areas = product.printAreaIds.map((id) => catalog.printAreas.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a));

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
      <ul className="space-y-3">
        {areas.map((area) => {
          const print = design.prints.find((p) => p.areaId === area.id);
          const side = areaSide(area.id);
          return (
            <li key={area.id} id={`area-${area.id}`} className={`rounded-xl border p-4 transition-colors ${print ? "border-gold/60 bg-gold/5" : "border-line"}`}>
              <div className="flex items-center justify-between gap-3">
                <button type="button" className="text-start" onClick={() => onFocusArea(area.id)}>
                  <span className="block font-semibold text-cream">{tr(area.name, locale)}</span>
                  <span className="text-xs text-cream-muted" dir="ltr">
                    {area.widthCm} × {area.heightCm} cm · {side === "back" ? t.back : side === "front" ? t.front : t.sleeve}
                  </span>
                </button>
                {print ? (
                  <button type="button" onClick={() => update(togglePrint(catalog, design, area.id))} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs text-cream-muted hover:border-gold hover:text-gold">
                    <X className="h-3.5 w-3.5" aria-hidden /> {t.remove}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      update(togglePrint(catalog, design, area.id));
                      onFocusArea(area.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-ink hover:bg-gold-light"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> {t.add}
                  </button>
                )}
              </div>

              {print ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold text-cream-muted">{t.method}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {catalog.printMethods.map((m) => {
                        const tiers = allowedTiers(catalog, design.sleeve, area.id, m.id);
                        if (tiers.length === 0) return null;
                        const block = methodBlock(catalog, design, m.id);
                        const price = m.prices[tiers.includes(print.tier) ? print.tier : tiers[tiers.length - 1]!];
                        return (
                          <Choice
                            key={m.id}
                            selected={print.methodId === m.id}
                            muted={Boolean(block)}
                            onSelect={() => update(updatePrint(catalog, design, area.id, { methodId: m.id }))}
                            className="px-2.5 py-2"
                          >
                            <span className="block text-sm font-semibold text-cream">{tr(m.name, locale)}</span>
                            <span className="text-xs">
                              {block ? (block === "fabric" ? t.unavailableFabric : t.unavailableColor) : price !== undefined ? formatMoney(price, locale) : ""}
                              {!block && m.pricedPerColor ? ` / ${dict.pricing.perColor}` : ""}
                            </span>
                          </Choice>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold text-cream-muted">{t.printSize}</p>
                    <div className="flex flex-wrap gap-2">
                      {allowedTiers(catalog, design.sleeve, area.id, print.methodId).map((tier) => (
                        <Choice key={tier} selected={print.tier === tier} onSelect={() => update(updatePrint(catalog, design, area.id, { tier }))} className="px-3 py-2">
                          <span className="block text-sm font-semibold text-cream">{tr(tierLabels[tier], locale)}</span>
                          <span className="text-xs">{tr(tierHints[tier], locale)}</span>
                        </Choice>
                      ))}
                    </div>
                  </div>

                  {catalog.printMethods.find((m) => m.id === print.methodId)?.pricedPerColor ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-cream-muted">{t.inkColors}</p>
                      <div className="flex items-center gap-2">
                        <button type="button" aria-label={t.decreaseColors} onClick={() => update(updatePrint(catalog, design, area.id, { colorCount: (print.colorCount ?? 1) - 1 }))} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line hover:border-gold">
                          <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <span className="w-6 text-center font-semibold" aria-live="polite">{print.colorCount ?? 1}</span>
                        <button type="button" aria-label={t.increaseColors} onClick={() => update(updatePrint(catalog, design, area.id, { colorCount: (print.colorCount ?? 1) + 1 }))} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line hover:border-gold">
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <ArtworkPanel catalog={catalog} design={design} print={print} update={update} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
