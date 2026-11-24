"use client";

import { Camera, Redo2, Rotate3d, Search, SearchX, Undo2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { canShowPhoto, GarmentView, useViewMode, ViewModeToggle } from "@/components/garment/GarmentView";
import type { CloseUpView } from "@/components/three/CloseUpOverlay";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { useDesignStore } from "@/lib/design/store";
import type { DesignSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";

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
  const [hideCloseUp, setHideCloseUp] = useState(false);
  const [mode, setMode] = useViewMode();
  const photo = mode === "photo" && canShowPhoto(catalog, design);

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
        {canShowPhoto(catalog, design) ? <ViewModeToggle mode={mode} onChange={setMode} /> : null}
      </div>
      <div className="absolute end-3 top-3 z-10 flex gap-1 rounded-full border border-line bg-ink/80 p-1">
        {closeUp ? (
          <IconButton label={hideCloseUp ? t.closeUpOn : t.closeUpOff} pressed={!hideCloseUp} onClick={() => setHideCloseUp((v) => !v)}>
            {hideCloseUp ? <Search className="h-4 w-4" /> : <SearchX className="h-4 w-4" />}
          </IconButton>
        ) : null}
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
      <p className={`pointer-events-none absolute inset-x-0 bottom-2 justify-center px-3 ${compact ? "hidden lg:flex" : "flex"}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1 text-center text-xs text-cream-muted">
          {photo ? <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Rotate3d className="h-3.5 w-3.5 shrink-0" aria-hidden />} {photo ? t.photoHint : t.dragToRotate}
        </span>
      </p>
    </div>
  );
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
