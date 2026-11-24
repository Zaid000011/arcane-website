"use client";

import { useEffect, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import { GarmentStage, type StageView } from "@/lib/three/stage";
import { CloseUpOverlay, type CloseUpView } from "./CloseUpOverlay";

/** Live, rotatable 3D garment. Loaded only in the browser (WebGL). */
export default function Garment3D({
  catalog,
  design,
  view,
  samples,
  placeholders = false,
  className,
  label,
  closeUp = null,
}: {
  catalog: Catalog;
  design: DesignSelection;
  view: StageView;
  samples?: PrintSamples;
  placeholders?: boolean;
  className?: string;
  label: string;
  /** A magnifying glass on the fabric, or a print pulled out into a big circle. */
  closeUp?: CloseUpView | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<GarmentStage | null>(null);
  const [stage, setStage] = useState<GarmentStage | null>(null);
  const product = catalog.products.find((p) => p.id === design.productId) ?? catalog.products[0]!;
  const color = catalog.colors.find((c) => c.id === design.bodyColorId)?.hex ?? "#151515";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = new GarmentStage(canvas, { interactive: true });
    stageRef.current = stage;
    setStage(stage);
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) stage.resize(rect.width, rect.height);
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      stage.dispose();
      stageRef.current = null;
      setStage(null);
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setGarment(product.mockup, design.sleeve, design.fitId, color);
  }, [product.mockup, design.sleeve, design.fitId, color]);

  // Prints are redrawn shortly after changes stop, so dragging artwork stays smooth.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const timer = setTimeout(() => {
      void import("@/lib/three/print-layers").then(({ updatePrintLayers }) => updatePrintLayers(stage, catalog, design, { placeholders, samples }));
    }, 90);
    return () => clearTimeout(timer);
  }, [catalog, design, placeholders, samples, color]);

  useEffect(() => {
    stageRef.current?.setView(view);
  }, [view]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" role="img" aria-label={label} />
      {closeUp && stage ? <CloseUpOverlay stage={stage} view={closeUp} catalog={catalog} design={design} /> : null}
    </div>
  );
}
