"use client";

import { ArrowLeft, ArrowRight, RotateCcw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { areaSide } from "@/lib/design/areas";
import { ensureCartLoaded, useCartStore } from "@/lib/cart/store";
import type { Catalog } from "@/lib/catalog/types";
import { designIssues } from "@/lib/design/checks";
import { duplicateElement, findElement, fitMeasuredText, removeElement, updateElement } from "@/lib/design/elements";
import { googleFontsHref } from "@/lib/design/fonts";
import { useMeasureStore } from "@/lib/design/measure-store";
import { defaultDesign, normalizeDesign, switchProduct, togglePrint } from "@/lib/design/logic";
import { DESIGNER_STEPS, useDesignStore, type DesignerStep } from "@/lib/design/store";
import { effectiveSizes } from "@/lib/order/roster";
import { emptyOrder } from "@/lib/order/types";
import { orderIssues } from "@/lib/order/validate";
import { quote as priceQuote } from "@/lib/pricing/engine";
import type { AnyIssue } from "@/lib/pricing/issues";
import type { DesignSelection } from "@/lib/pricing/types";
import type { RequestKind } from "@/lib/requests/types";
import { queryParam, STATIC_SITE } from "@/lib/site-mode";
import { SendDialog } from "@/components/send/SendDialog";
import type { CloseUpView } from "@/components/three/CloseUpOverlay";
import { useI18n } from "@/i18n/client";
import { fmt, formatMoney } from "@/i18n/format";
import { ColorsPanel, FabricPanel, GarmentPanel, PrintsPanel } from "./panels";
import { PersonalizationPanel } from "./PersonalizationPanel";
import { ViewerCard } from "./ViewerCard";
import { PriceSummary } from "./PriceSummary";
import { PrintTypesDialog } from "./PrintTypesDialog";
import { ReviewPanel } from "./ReviewPanel";
import { SizesPanel } from "./SizesPanel";

/** Steps after which quantities matter (so "add at least one piece" isn't shown too early). */
const ORDER_STEPS: DesignerStep[] = ["sizes", "review"];

export function Designer({ catalog, initialProductId }: { catalog: Catalog; initialProductId?: string }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const router = useRouter();
  const stored = useDesignStore((s) => s.design);
  const commit = useDesignStore((s) => s.commit);
  const step = useDesignStore((s) => s.step);
  const setStep = useDesignStore((s) => s.setStep);
  const setView = useDesignStore((s) => s.setView);
  const select = useDesignStore((s) => s.select);
  const selectedArea = useDesignStore((s) => s.selection?.areaId);
  const measurements = useMeasureStore((s) => s.measurements);
  const order = useDesignStore((s) => s.order);
  const editingCartItemId = useDesignStore((s) => s.editingCartItemId);
  const [fallback] = useState(() => defaultDesign(catalog, initialProductId));
  const design = stored ?? fallback;
  const [sendKind, setSendKind] = useState<RequestKind | null>(null);
  const [explainPrints, setExplainPrints] = useState(false);

  // Load the design saved on this device after the first render (avoids a server/client mismatch).
  useEffect(() => {
    void Promise.resolve(useDesignStore.persist.rehydrate()).then(() => {
      const wanted = initialProductId ?? (STATIC_SITE ? queryParam("product") : undefined);
      const saved = useDesignStore.getState().design;
      let next = saved ? normalizeDesign(catalog, saved) : defaultDesign(catalog, wanted);
      if (wanted && next.productId !== wanted && catalog.products.some((p) => p.id === wanted && p.enabled)) {
        next = switchProduct(catalog, next, wanted);
      }
      useDesignStore.getState().setDesign(next);
    });
    void ensureCartLoaded();
  }, [catalog, initialProductId]);

  // Once the browser has measured text, make sure it fits inside its print box.
  useEffect(() => {
    const current = useDesignStore.getState().design;
    if (!current) return;
    const fitted = fitMeasuredText(catalog, current, measurements);
    if (fitted !== current) useDesignStore.getState().setDesign(fitted);
  }, [catalog, measurements, stored]);

  // Keyboard shortcuts for the selected artwork.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const s = useDesignStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      const sel = s.selection;
      const d = s.design;
      if (!sel?.elementId || !d) return;
      const el = findElement(d, sel.areaId, sel.elementId);
      if (!el) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.commit(removeElement(d, sel.areaId, el.id));
        s.select({ areaId: sel.areaId, elementId: null });
      } else if (mod && key === "d") {
        e.preventDefault();
        const r = duplicateElement(catalog, d, sel.areaId, el.id);
        s.commit(r.design);
        if (r.newId) s.select({ areaId: sel.areaId, elementId: r.newId });
      } else if (e.key === "Escape") {
        s.select({ areaId: sel.areaId, elementId: null });
      } else if (!el.locked) {
        const n = e.shiftKey ? 10 : 1;
        const delta = ({ ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] } as Record<string, [number, number]>)[e.key];
        if (!delta) return;
        e.preventDefault();
        s.commit(updateElement(catalog, d, sel.areaId, el.id, { x: el.x + delta[0], y: el.y + delta[1] }, useMeasureStore.getState().measurements[el.id]), `nudge:${el.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [catalog]);

  const update = useCallback((next: DesignSelection, coalesce?: string) => commit(next, coalesce), [commit]);
  const product = catalog.products.find((p) => p.id === design.productId) ?? catalog.products[0]!;
  const sizes = useMemo(() => effectiveSizes(order, design.personalization), [order, design.personalization]);
  const quote = useMemo(() => priceQuote(catalog, design, { sizes, deliverySpeedId: order.deliverySpeedId }), [catalog, design, sizes, order.deliverySpeedId]);
  const artworkIssues = useMemo(() => designIssues(design), [design]);
  const quantityIssues = useMemo(() => orderIssues(design, order), [design, order]);
  const showOrderIssues = ORDER_STEPS.includes(step);
  const extraIssues: AnyIssue[] = showOrderIssues ? [...artworkIssues, ...quantityIssues] : artworkIssues;
  const blocking = [...quote.issues, ...artworkIssues, ...quantityIssues].some((i) => i.severity === "error");
  // For a group order the final quantity isn't known yet, so only design problems count.
  const designBlocked = [...quote.issues.filter((i) => i.code !== "minQuantity"), ...artworkIssues].some((i) => i.severity === "error");
  const editingExisting = Boolean(editingCartItemId && useCartStore.getState().items.some((i) => i.id === editingCartItemId));

  const stepIndex = DESIGNER_STEPS.indexOf(step);
  const goTo = (s: DesignerStep) => {
    setStep(s);
    if (s === "names" || s === "sizes") setView(design.personalization.names || design.personalization.numbers || design.personalization.namesList ? "back" : useDesignStore.getState().view);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      document.getElementById("designer-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  /** Turns the 3D garment to the area and brings its card into view. */
  const focusArea = (areaId: string) => {
    setView(areaSide(areaId));
    if (step !== "prints") setStep("prints");
    const current = useDesignStore.getState().selection;
    if (current?.areaId !== areaId) select({ areaId, elementId: null });
    requestAnimationFrame(() => document.getElementById(`area-${areaId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  const addToCart = async (asNew: boolean) => {
    await ensureCartLoaded();
    const s = useDesignStore.getState();
    const current = s.design ?? design;
    const cart = useCartStore.getState();
    if (!asNew && s.editingCartItemId && cart.items.some((i) => i.id === s.editingCartItemId)) cart.replace(s.editingCartItemId, current, s.order);
    else cart.add(current, s.order);
    s.setEditingCartItemId(null);
    router.push("/cart");
  };

  const panelProps = { catalog, design, product, update };
  const editing = step === "prints";
  // The fabric step shows a magnifying glass; the print step pulls the chosen print out into a close-up.
  const closeUpArea = design.prints.some((p) => p.areaId === selectedArea) ? selectedArea : design.prints[0]?.areaId;
  const closeUp: CloseUpView | null = step === "fabric" ? { type: "fabric" } : step === "prints" && closeUpArea ? { type: "print", areaId: closeUpArea } : null;

  return (
    <div className="section pt-6 pb-28 lg:pb-12">
      <link rel="stylesheet" href={googleFontsHref} precedence="default" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl tracking-wide uppercase sm:text-5xl">{t.title}</h1>
        <button
          type="button"
          onClick={() => {
            update(defaultDesign(catalog, product.id));
            useDesignStore.getState().setOrder(emptyOrder());
            useDesignStore.getState().setEditingCartItemId(null);
            select(null);
            setStep("garment");
            setView("front");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-cream-muted hover:text-gold"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> {t.startOver}
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-gold/40 bg-[linear-gradient(110deg,rgba(122,10,10,0.45),rgba(28,14,16,0.6))] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-cream">{dict.send.designBanner}</p>
        <button type="button" onClick={() => setSendKind("design")} aria-haspopup="dialog" className="btn btn-primary shrink-0 px-5 py-2.5">
          <Upload className="h-4 w-4" aria-hidden /> {dict.send.designButton}
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className={editing ? "sticky top-16 z-30 -mx-4 bg-ink/95 px-4 pb-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-20 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:pb-0 lg:backdrop-blur-none" : "lg:sticky lg:top-20 lg:self-start"}>
          <ViewerCard catalog={catalog} design={design} placeholders={editing} compact={editing} closeUp={closeUp} />
          <div className="mt-4 hidden lg:block">
            <PriceSummary quote={quote} catalog={catalog} extraIssues={extraIssues} />
          </div>
        </div>

        <div id="designer-panel" className="min-w-0 scroll-mt-20">
          <nav aria-label={t.title} className="mb-6">
            <ol className="-mx-1 flex snap-x gap-1.5 overflow-x-auto rounded-full border border-line bg-ink-2/70 p-1.5 [scrollbar-width:none]">
              {DESIGNER_STEPS.map((s, i) => (
                <li key={s} className="snap-start">
                  <button
                    type="button"
                    aria-current={s === step ? "step" : undefined}
                    onClick={() => goTo(s)}
                    className="rounded-full px-3 py-2 text-xs font-semibold whitespace-nowrap text-cream-muted transition-colors hover:text-cream aria-[current=step]:bg-gold aria-[current=step]:text-ink sm:text-sm"
                  >
                    <span className="me-1.5 opacity-70">{i + 1}</span>
                    {t.steps[s]}
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-center text-xs text-cream-muted">{fmt(t.stepOf, { n: stepIndex + 1, total: DESIGNER_STEPS.length })}</p>
          </nav>

          {step === "garment" && <GarmentPanel {...panelProps} />}
          {step === "fabric" && <FabricPanel {...panelProps} />}
          {step === "colors" && <ColorsPanel {...panelProps} onSendColor={() => setSendKind("color")} />}
          {step === "prints" && <PrintsPanel {...panelProps} onFocusArea={focusArea} onExplainPrints={() => setExplainPrints(true)} />}
          {step === "names" && <PersonalizationPanel {...panelProps} />}
          {step === "sizes" && <SizesPanel catalog={catalog} design={design} quote={quote} onSendSize={() => setSendKind("size")} />}
          {step === "review" && (
            <ReviewPanel
              catalog={catalog}
              design={design}
              quote={quote}
              blocking={blocking}
              designBlocked={designBlocked}
              editingExisting={editingExisting}
              onAdd={(asNew) => void addToCart(asNew)}
            />
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            {stepIndex > 0 ? (
              <button type="button" onClick={() => goTo(DESIGNER_STEPS[stepIndex - 1]!)} className="btn btn-secondary">
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t.previous}
              </button>
            ) : (
              <span />
            )}
            {stepIndex < DESIGNER_STEPS.length - 1 ? (
              <button type="button" onClick={() => goTo(DESIGNER_STEPS[stepIndex + 1]!)} className="btn btn-primary">
                {t.next} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="mt-8 lg:hidden">
            <PriceSummary quote={quote} catalog={catalog} extraIssues={extraIssues} />
          </div>
        </div>
      </div>

      <SendDialog
        kind={sendKind}
        onClose={() => setSendKind(null)}
        catalog={catalog}
        productId={product.id}
        onUseColor={(colorId) => update({ ...design, bodyColorId: colorId })}
      />
      <PrintTypesDialog open={explainPrints} onClose={() => setExplainPrints(false)} catalog={catalog} design={design} />

      {/* Mobile price bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur lg:hidden">
        <div className="section flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-xs text-cream-muted">{quote.quantity > 0 ? `${t.total} · ${fmt(t.piecesLine, { count: quote.quantity })}` : t.pricePerPiece}</p>
            <p className="font-display text-2xl tracking-wide text-gold">{formatMoney(quote.quantity > 0 ? quote.total : quote.unitPrice, locale)}</p>
          </div>
          {stepIndex < DESIGNER_STEPS.length - 1 ? (
            <button type="button" onClick={() => goTo(DESIGNER_STEPS[stepIndex + 1]!)} className="btn btn-primary">
              {t.next} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
