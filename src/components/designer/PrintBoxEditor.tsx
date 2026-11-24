"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { findElement, updateElement } from "@/lib/design/elements";
import { elementBBox, elementSize, measuredFor, MIN_SIZE_MM, printBoxMm, snap } from "@/lib/design/geometry";
import { useMeasureStore } from "@/lib/design/measure-store";
import { useDesignStore } from "@/lib/design/store";
import type { DesignElement } from "@/lib/design/types";
import type { PrintSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { ElementShape } from "./ElementShape";

type Gesture =
  | { kind: "move"; id: string; start: { x: number; y: number }; origin: { x: number; y: number } }
  | { kind: "resize"; id: string; startDist: number; startSize: number }
  | { kind: "rotate"; id: string };

/**
 * Flat, true-to-size editor for one print box: drag to move, corner square to
 * resize, top circle to rotate, snapping to the center lines. Units are mm.
 * The 3D garment updates as you edit.
 */
export function PrintBoxEditor({ catalog, print, bodyHex }: { catalog: Catalog; print: PrintSelection; bodyHex: string }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const area = catalog.printAreas.find((a) => a.id === print.areaId)!;
  const box = printBoxMm(area, print.tier);
  const pad = Math.max(box.w, box.h) * 0.07;
  const contentRef = useRef<SVGGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [pxPerMm, setPxPerMm] = useState(1);
  const clipId = `edit-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const selection = useDesignStore((s) => s.selection);
  const measurements = useMeasureStore((s) => s.measurements);
  const elements = print.elements ?? [];
  const selectedId = selection?.areaId === print.areaId ? selection.elementId : null;
  const selected = selectedId ? elements.find((e) => e.id === selectedId) : undefined;
  const handleR = 12 / pxPerMm;

  useLayoutEffect(() => {
    const m = contentRef.current?.getScreenCTM();
    if (!m) return;
    const v = Math.hypot(m.a, m.b);
    if (v > 0 && Math.abs(v - pxPerMm) / v > 0.01) setPxPerMm(v);
  });
  useEffect(() => {
    const onResize = () => setPxPerMm((v) => v * 1.0001);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const m = contentRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const start = (e: ReactPointerEvent<SVGElement>, g: Gesture) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    useDesignStore.getState().beginGesture();
    gesture.current = g;
  };

  const onElementDown = (e: ReactPointerEvent<SVGGElement>, el: DesignElement) => {
    e.stopPropagation();
    useDesignStore.getState().select({ areaId: area.id, elementId: el.id });
    if (el.locked) return;
    const p = toLocal(e);
    if (p) start(e, { kind: "move", id: el.id, start: p, origin: { x: el.x, y: el.y } });
  };

  const onMove = (e: ReactPointerEvent<SVGElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = toLocal(e);
    const state = useDesignStore.getState();
    const d = state.design;
    if (!p || !d) return;
    const el = findElement(d, area.id, g.id);
    if (!el) return;
    const m = useMeasureStore.getState().measurements[el.id];
    if (g.kind === "move") {
      const threshold = 7 / pxPerMm;
      const bb = elementBBox(el, measuredFor(el, m));
      const cxOff = bb.x + bb.w / 2;
      const cyOff = bb.y + bb.h / 2;
      const sx = snap(g.origin.x + p.x - g.start.x + cxOff, box.w / 2, threshold);
      const sy = snap(g.origin.y + p.y - g.start.y + cyOff, box.h / 2, threshold);
      setGuides({ v: sx.snapped, h: sy.snapped });
      state.setDesign(updateElement(catalog, d, area.id, el.id, { x: sx.value - cxOff, y: sy.value - cyOff }, m));
    } else if (g.kind === "resize") {
      const size = Math.max(MIN_SIZE_MM, g.startSize * (Math.hypot(p.x - el.x, p.y - el.y) / g.startDist));
      state.setDesign(updateElement(catalog, d, area.id, el.id, el.type === "text" ? { size } : { w: size }, m));
    } else {
      let deg = (Math.atan2(p.y - el.y, p.x - el.x) * 180) / Math.PI + 90;
      deg = ((((deg + 180) % 360) + 360) % 360) - 180;
      const nearest = Math.round(deg / 15) * 15;
      if (Math.abs(deg - nearest) < 4) deg = nearest;
      state.setDesign(updateElement(catalog, d, area.id, el.id, { rotation: Math.round(deg * 10) / 10 }, m));
    }
  };

  const onUp = () => {
    gesture.current = null;
    setGuides({ v: false, h: false });
  };

  const selBox = selected ? elementBBox(selected, measuredFor(selected, measurements[selected.id])) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-line" style={{ backgroundColor: bodyHex }}>
      <svg
        viewBox={`${-pad} ${-pad} ${box.w + pad * 2} ${box.h + pad * 2}`}
        className="mx-auto block h-auto max-h-[44vh] w-full touch-none"
        role="group"
        aria-label={`${tr(area.name, locale)} · ${t.artwork}`}
        onPointerDown={() => useDesignStore.getState().select({ areaId: area.id, elementId: null })}
      >
        <g ref={contentRef}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={box.w} height={box.h} />
            </clipPath>
          </defs>
          <rect x={0} y={0} width={box.w} height={box.h} fill="rgba(255,255,255,0.04)" stroke="#E2C766" strokeWidth={1.2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          <g clipPath={`url(#${clipId})`}>
            {elements.map((el) => (
              <g
                key={el.id}
                transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}
                role="button"
                tabIndex={0}
                aria-pressed={el.id === selectedId}
                aria-label={el.type === "text" ? el.text : el.type === "image" ? el.name : t.clipartLayer}
                onPointerDown={(e) => onElementDown(e, el)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onKeyDown={(e) => e.key === "Enter" && useDesignStore.getState().select({ areaId: area.id, elementId: el.id })}
                style={{ cursor: el.locked ? "pointer" : "move", touchAction: "none", outline: "none" }}
              >
                <ElementShape el={el} missingLabel={t.missingImage} />
              </g>
            ))}
          </g>
          {guides.v ? <line x1={box.w / 2} y1={-pad} x2={box.w / 2} y2={box.h + pad} stroke="#E2C766" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}
          {guides.h ? <line x1={-pad} y1={box.h / 2} x2={box.w + pad} y2={box.h / 2} stroke="#E2C766" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null}

          {selected && selBox ? (
            <g transform={`translate(${selected.x} ${selected.y}) rotate(${selected.rotation})`}>
              <rect
                x={selBox.x - 1}
                y={selBox.y - 1}
                width={selBox.w + 2}
                height={selBox.h + 2}
                fill="none"
                stroke={selected.locked ? "#C9B79C" : "#E2C766"}
                strokeWidth={1.5}
                strokeDasharray={selected.locked ? "3 3" : undefined}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              {!selected.locked ? (
                <>
                  <line x1={selBox.x + selBox.w / 2} y1={selBox.y - 1} x2={selBox.x + selBox.w / 2} y2={selBox.y - 1 - handleR * 2} stroke="#E2C766" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                  <circle
                    cx={selBox.x + selBox.w / 2}
                    cy={selBox.y - 1 - handleR * 2}
                    r={handleR * 0.7}
                    fill="#140A0B"
                    stroke="#E2C766"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                    role="slider"
                    aria-label={t.rotation}
                    aria-valuenow={Math.round(selected.rotation)}
                    style={{ cursor: "grab", touchAction: "none" }}
                    onPointerDown={(e) => start(e, { kind: "rotate", id: selected.id })}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  />
                  <rect
                    x={selBox.x + selBox.w + 1 - handleR * 0.6}
                    y={selBox.y + selBox.h + 1 - handleR * 0.6}
                    width={handleR * 1.2}
                    height={handleR * 1.2}
                    rx={handleR * 0.25}
                    fill="#E2C766"
                    stroke="#140A0B"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    role="slider"
                    aria-label={t.size}
                    aria-valuenow={Math.round(elementSize(selected))}
                    style={{ cursor: "nwse-resize", touchAction: "none" }}
                    onPointerDown={(e) => {
                      const p = toLocal(e);
                      if (p) start(e, { kind: "resize", id: selected.id, startDist: Math.max(1, Math.hypot(p.x - selected.x, p.y - selected.y)), startSize: elementSize(selected) });
                    }}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  />
                </>
              ) : null}
            </g>
          ) : null}
        </g>
      </svg>
    </div>
  );
}
