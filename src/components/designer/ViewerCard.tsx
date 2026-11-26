"use client";

import { Camera, Redo2, Rotate3d, Search, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { canShowPhoto, GarmentView, useViewMode, ViewModeToggle } from "@/components/garment/GarmentView";
import type { CloseUpView } from "@/components/three/CloseUpOverlay";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { useDesignStore } from "@/lib/design/store";
import type { DesignSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { siteConfig } from "@/config/site";
import { hasFullTrims, trimsOf } from "@/lib/design/options";
import { hasPhotos } from "@/lib/mockup/photos";

/** The garment (a real photo, or 3D to turn around) with front/back buttons, undo/redo and, on some steps, a close-up. */
export function ViewerCard({
  catalog,
  design,
  placeholders,
  compact,
  closeUp = null,
}: {
  catalog: Catalog;
  design: DesignSelection;
  placeholders: boolean;
  compact: boolean;
  closeUp?: CloseUpView | null;
}) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const view = useDesignStore((s) => s.view);
  const setView = useDesignStore((s) => s.setView);
  const canUndo = useDesignStore((s) => s.past.length > 0);
  const canRedo = useDesignStore((s) => s.future.length > 0);
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);
  const sample = useDesignStore((s) => s.order.roster.find((r) => r.name || r.number));
  const samples = useMemo(() => ({ name: sample?.name || t.sampleName, number: sample?.number || t.sampleNumber }), [sample?.name, sample?.number, t.sampleName, t.sampleNumber]);
  const product = catalog.products.find((p) => p.id === design.productId);
  const [hideCloseUp, setHideCloseUp] = useCloseUpHidden();
  const [mode, setMode] = useViewMode();
  const photo = mode === "photo" && canShowPhoto(catalog, design);
  // While 3D is off, a garment without cuffs or waistband shows the standard photo: say so.
  const trims = trimsOf(product, design);
  const standardPhoto = photo && Boolean(product) && !hasFullTrims(trims) && !hasPhotos(product!.mockup, design.sleeve, trims);

  return (
    <div className="card relative overflow-hidden bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,39,0.16),transparent_62%)]">
      <div className="absolute start-3 top-3 z-10 flex flex-col items-start gap-2">
        <div role="group" aria-label={t.viewLabel} className="flex rounded-full border border-line bg-ink/80 p-1 text-sm">
          {(["front", "back"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className="rounded-full px-4 py-1.5 text-cream-muted transition-colors aria-pressed:bg-gold aria-pressed:text-ink"
            >
              {v === "front" ? t.front : t.back}
            </button>
          ))}
        </div>
        {siteConfig.show3d && canShowPhoto(catalog, design) ? <ViewModeToggle mode={mode} onChange={setMode} /> : null}
      </div>
      <div className="absolute end-3 top-3 z-10 flex gap-1 rounded-full border border-line bg-ink/80 p-1">
        <IconButton label={t.undo} disabled={!canUndo} onClick={undo}>
          <Undo2 className="h-4 w-4 rtl:-scale-x-100" />
        </IconButton>
        <IconButton label={t.redo} disabled={!canRedo} onClick={redo}>
          <Redo2 className="h-4 w-4 rtl:-scale-x-100" />
        </IconButton>
      </div>
      <div className={`${compact ? "h-[34vh]" : "h-[52vh]"} lg:h-[64vh] ${photo ? "" : "cursor-grab active:cursor-grabbing"}`}>
        <GarmentView
          mode={mode}
          catalog={catalog}
          design={design}
          view={view}
          samples={samples}
          placeholders={placeholders}
          className={photo ? "h-full w-full" : "h-full w-full touch-none"}
          label={`${product ? tr(product.name, locale) : ""} · ${photo ? t.photoMode : t.mode3d}`}
          closeUp={hideCloseUp ? null : closeUp}
        />
      </div>
      {standardPhoto ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-3">
          <span className="max-w-[85%] rounded-full bg-ink/85 px-3 py-1 text-center text-[11px] text-gold-light">{t.trimsPhotoNote}</span>
        </p>
      ) : null}
      {closeUp ? (
        <button
          type="button"
          aria-pressed={!hideCloseUp}
          onClick={() => setHideCloseUp(!hideCloseUp)}
          className="absolute start-2 bottom-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-gold/60 bg-ink/90 px-3 py-1.5 text-xs font-semibold text-gold-light shadow-lg transition-colors hover:border-gold hover:text-gold"
        >
          {hideCloseUp ? <Search className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
          {hideCloseUp ? t.showCloseUp : t.hideCloseUp}
        </button>
      ) : null}
      <p className={`pointer-events-none absolute inset-x-0 bottom-2 justify-center px-3 ${compact ? "hidden lg:flex" : "flex"}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1 text-center text-xs text-cream-muted">
          {photo ? <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Rotate3d className="h-3.5 w-3.5 shrink-0" aria-hidden />} {photo ? (siteConfig.show3d ? t.photoHint : t.photoOnlyHint) : t.dragToRotate}
        </span>
      </p>
    </div>
  );
}

const CLOSE_UP_KEY = "arcane-closeup-hidden";

/** Whether the customer hid the close-up. Remembered on this device, so it stays hidden on every step and visit. */
function useCloseUpHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(CLOSE_UP_KEY) === "1");
    } catch {
      // Storage can be blocked; the close-up then just starts shown.
    }
  }, []);
  const set = (next: boolean) => {
    setHidden(next);
    try {
      if (next) localStorage.setItem(CLOSE_UP_KEY, "1");
      else localStorage.removeItem(CLOSE_UP_KEY);
    } catch {
      // Not remembered, but still hidden for now.
    }
  };
  return [hidden, set];
}

function IconButton({ label, disabled, pressed, onClick, children }: { label: string; disabled?: boolean; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-cream-muted transition-colors hover:text-gold disabled:opacity-30"
    >
      {children}
    </button>
  );
}
