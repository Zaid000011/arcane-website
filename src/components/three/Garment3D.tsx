"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";
import { printAnchor, type PrintSamples } from "@/lib/three/print-layers";
import type { Vec3 } from "@/lib/three/shape";
import { GarmentStage, type StageView } from "@/lib/three/stage";
import { CloseUpOverlay, type CloseUpTarget, type CloseUpView } from "./CloseUpOverlay";
import { bodyHex, trimsOf } from "@/lib/design/options";

/** Lets a close-up follow a print on the turning 3D garment. */
function stageTarget(stage: GarmentStage, catalog: Catalog): CloseUpTarget {
  let shown: object | null = stage.model ?? stage.garment;
  const anchors = new Map<string, { p: Vec3; n: Vec3 } | null>();
  return {
    element: () => stage.renderer.domElement,
    locate(print, design) {
      const now = stage.model ?? stage.garment;
      if (now !== shown) {
        shown = now;
        anchors.clear();
      }
      // Remembered per placement, so moving the artwork moves the callout.
      const key = `${design.productId}|${design.sleeve}|${print.id}|${JSON.stringify(print.elements ?? [])}`;
      if (!anchors.has(key)) {
        if (anchors.size > 40) anchors.clear();
        anchors.set(key, shown ? printAnchor(stage, catalog, design, print) : null);
      }
      const a = anchors.get(key);
      return a ? stage.project(a.p, a.n) : null;
    },
    subscribe: (fn) => stage.onRender(fn),
    refresh: () => stage.requestRender(),
  };
}

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
  // Bumped when the garment shown changes (the real 3D model finished loading), so prints are laid on again.
  const [garmentVersion, setGarmentVersion] = useState(0);
  const product = catalog.products.find((p) => p.id === design.productId) ?? catalog.products[0]!;
  const color = bodyHex(catalog, design);
  const trims = trimsOf(product, design);
  const fabric = product.fabrics.find((f) => f.id === design.fabricId) ?? product.fabrics[0];
  const fabricId = fabric?.id ?? "cotton";
  const fabricKind = fabric?.kind ?? "cotton";

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
    const stopGarment = stage.onGarmentChange(() => setGarmentVersion((v) => v + 1));
    return () => {
      stopGarment();
      ro.disconnect();
      stage.dispose();
      stageRef.current = null;
      setStage(null);
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setGarment(product.mockup, design.sleeve, design.fitId, color, { id: fabricId, kind: fabricKind }, trims);
    // `trims` is rebuilt every render; its two flags are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.mockup, design.sleeve, design.fitId, color, fabricId, fabricKind, trims.cuffs, trims.waistband]);

  // Prints are redrawn shortly after changes stop, so dragging artwork stays smooth.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const timer = setTimeout(() => {
      void import("@/lib/three/print-layers").then(({ updatePrintLayers }) => updatePrintLayers(stage, catalog, design, { placeholders, samples }));
    }, 90);
    return () => clearTimeout(timer);
  }, [catalog, design, placeholders, samples, color, garmentVersion]);

  useEffect(() => {
    stageRef.current?.setView(view);
  }, [view]);

  const target = useMemo(() => (stage ? stageTarget(stage, catalog) : null), [stage, catalog]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" role="img" aria-label={label} />
      {closeUp && target ? <CloseUpOverlay target={target} view={closeUp} catalog={catalog} design={design} /> : null}
    </div>
  );
}
