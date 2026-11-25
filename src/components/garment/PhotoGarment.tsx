"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloseUpOverlay, type CloseUpTarget, type CloseUpView } from "@/components/three/CloseUpOverlay";
import type { Catalog } from "@/lib/catalog/types";
import { useMeasureStore } from "@/lib/design/measure-store";
import { isPrintSide, panelBox, placeRect, printRenderRect } from "@/lib/design/sides";
import { composeGarmentPhoto, type Composed } from "@/lib/mockup/compose";
import { photoViewFor, placePrintOnPhoto, quadCenter } from "@/lib/mockup/photos";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import type { StageView } from "@/lib/three/stage";

const PAD = { top: 0.07, bottom: 0.07, side: 0.05 };

/**
 * The design on a real garment photo, front or back (sleeve prints show on the
 * front). Loaded only in the browser. Calls `onFail` if the photo can't be
 * shown, so the 3D garment can take over.
 */
export default function PhotoGarment({
  catalog,
  design,
  view,
  samples,
  placeholders = false,
  className,
  label,
  closeUp = null,
  onFail,
}: {
  catalog: Catalog;
  design: DesignSelection;
  view: StageView;
  samples?: PrintSamples;
  placeholders?: boolean;
  className?: string;
  label: string;
  closeUp?: CloseUpView | null;
  onFail?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number; dpr: number } | null>(null);
  const [ready, setReady] = useState(false);
  const drawn = useRef<Composed | null>(null);
  const listeners = useRef(new Set<() => void>());
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const photoView = photoViewFor(view);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (!r || r.width < 2 || r.height < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      setSize((old) => (old && Math.abs(old.w - r.width) < 1 && Math.abs(old.h - r.height) < 1 && old.dpr === dpr ? old : { w: r.width, h: r.height, dpr }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redrawn shortly after changes stop, so dragging artwork stays smooth.
  useEffect(() => {
    if (!size) return;
    let live = true;
    const timer = setTimeout(
      () => {
        composeGarmentPhoto({ catalog, design, view: photoView, width: Math.round(size.w * size.dpr), height: Math.round(size.h * size.dpr), samples, placeholders, pad: PAD })
          .then((result) => {
            if (!live) return;
            const canvas = canvasRef.current;
            if (!result || !canvas) {
              if (!result) failRef.current?.();
              return;
            }
            const turned = drawn.current && drawn.current.photo.name !== result.photo.name;
            canvas.width = result.image.width;
            canvas.height = result.image.height;
            canvas.getContext("2d")!.putImageData(result.image, 0, 0);
            if (turned) canvas.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
            drawn.current = result;
            setReady(true);
            for (const fn of listeners.current) fn();
          })
          .catch(() => {
            if (live) failRef.current?.();
          });
      },
      drawn.current ? 70 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [catalog, design, photoView, samples, placeholders, size]);

  // Lets the close-up's circle and lines point at a print area on the photo.
  const target = useMemo<CloseUpTarget>(
    () => ({
      element: () => canvasRef.current,
      locate(print, design) {
        const d = drawn.current;
        const canvas = canvasRef.current;
        const product = catalog.products.find((p) => p.id === design.productId);
        if (!d || !canvas || !canvas.width || !product || !isPrintSide(print.areaId)) return null;
        const rect = printRenderRect(print.elements, panelBox(product.mockup, design.sleeve, print.areaId), useMeasureStore.getState().measurements);
        const quad = placePrintOnPhoto(d.photo, placeRect(product.mockup, design.sleeve, print.areaId, rect));
        if (!quad) return null;
        const [x, y] = quadCenter(quad);
        const k = canvas.clientWidth / canvas.width;
        return { x: (x * d.layout.scale + d.layout.dx) * k, y: (y * d.layout.scale + d.layout.dy) * k, facing: true };
      },
      subscribe(fn) {
        listeners.current.add(fn);
        return () => {
          listeners.current.delete(fn);
        };
      },
      refresh() {
        requestAnimationFrame(() => {
          for (const fn of listeners.current) fn();
        });
      },
    }),
    [catalog],
  );

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <canvas ref={canvasRef} role="img" aria-label={label} className={`block h-full w-full transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`} />
      {!ready ? <div className="absolute inset-0 animate-pulse bg-gold/5" aria-busy="true" /> : null}
      {closeUp && ready ? <CloseUpOverlay target={target} view={closeUp} catalog={catalog} design={design} /> : null}
    </div>
  );
}
