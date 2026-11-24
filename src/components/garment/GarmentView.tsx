"use client";

import { Camera, Rotate3d } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { CloseUpView } from "@/components/three/CloseUpOverlay";
import type { Catalog } from "@/lib/catalog/types";
import { hasPhotos } from "@/lib/mockup/photos";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import type { StageView } from "@/lib/three/stage";
import { useI18n } from "@/i18n/client";

const Loading = () => <div className="h-full w-full animate-pulse bg-gold/5" aria-busy="true" />;
const Garment3D = dynamic(() => import("@/components/three/Garment3D"), { ssr: false, loading: Loading });
const PhotoGarment = dynamic(() => import("./PhotoGarment"), { ssr: false, loading: Loading });

/** A real photo of the garment (the default), or the 3D garment you can turn around. */
export type ViewMode = "photo" | "3d";

const KEY = "arcane.viewMode";

/** The picture type, remembered while the browser tab stays open. */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>("photo");
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) === "3d") setMode("3d");
    } catch {
      // Storage can be blocked; the default is fine.
    }
  }, []);
  const choose = useCallback((next: ViewMode) => {
    setMode(next);
    try {
      sessionStorage.setItem(KEY, next);
    } catch {
      // Not remembered, that's all.
    }
  }, []);
  return [mode, choose];
}

/** True when the design can be shown as a photo (every garment has photos; this guards new ones). */
export function canShowPhoto(catalog: Catalog, design: DesignSelection): boolean {
  const product = catalog.products.find((p) => p.id === design.productId) ?? catalog.products[0];
  return Boolean(product && hasPhotos(product.mockup, design.sleeve));
}

/** The garment as a photo or in 3D. Falls back to 3D when there's no photo or it can't load. */
export function GarmentView({
  mode,
  catalog,
  design,
  view,
  samples,
  placeholders,
  className,
  label,
  closeUp = null,
}: {
  mode: ViewMode;
  catalog: Catalog;
  design: DesignSelection;
  view: StageView;
  samples?: PrintSamples;
  placeholders?: boolean;
  className?: string;
  label: string;
  closeUp?: CloseUpView | null;
}) {
  const [failed, setFailed] = useState(false);
  if (mode === "photo" && !failed && canShowPhoto(catalog, design)) {
    return <PhotoGarment catalog={catalog} design={design} view={view} samples={samples} placeholders={placeholders} className={className} label={label} closeUp={closeUp} onFail={() => setFailed(true)} />;
  }
  return <Garment3D catalog={catalog} design={design} view={view} samples={samples} placeholders={placeholders} className={className} label={label} closeUp={closeUp} />;
}

/** Photo | 3D switch. */
export function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const { dict } = useI18n();
  const t = dict.designer;
  return (
    <div role="group" aria-label={t.viewMode} className="flex rounded-full border border-line bg-ink/80 p-1 text-xs">
      {(["photo", "3d"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-cream-muted transition-colors aria-pressed:bg-gold aria-pressed:text-ink"
        >
          {m === "photo" ? <Camera className="h-3.5 w-3.5" aria-hidden /> : <Rotate3d className="h-3.5 w-3.5" aria-hidden />}
          {m === "photo" ? t.photoMode : t.mode3d}
        </button>
      ))}
    </div>
  );
}
