"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { tierLabels, tr } from "@/lib/catalog";
import type { Catalog } from "@/lib/catalog/types";
import { boxFor, findElement, updateElement } from "@/lib/design/elements";
import { elementBBox, elementSize, measuredFor, MIN_SIZE_MM, snap } from "@/lib/design/geometry";
import { useMeasureStore } from "@/lib/design/measure-store";
import { isPrintSide, printBounds, sideNames, sidePanel, sideView } from "@/lib/design/sides";
import { useDesignStore } from "@/lib/design/store";
import type { DesignElement } from "@/lib/design/types";
import type { PlainPhoto } from "@/lib/mockup/stills";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { useI18n } from "@/i18n/client";
import { ElementShape } from "./ElementShape";

type Gesture =
  | { kind: "move"; id: string; start: { x: number; y: number }; origin: { x: number; y: number } }
  | { kind: "resize"; id: string; startDist: number; startSize: number }
  | { kind: "rotate"; id: string };

/** The plain garment photo behind the editor (front, back and hood), so artwork is placed on the real garment. */
function usePlainPhoto(catalog: Catalog, design: DesignSelection, side: string): PlainPhoto | null {
  const [photo, setPhoto] = useState<PlainPhoto | null>(null);
  const view = sideView(side);
  const usable = view === "front" || view === "back";
  const key = `${design.productId}|${design.sleeve}|${design.bodyColorId}|${design.customColorHex ?? ""}|${view}`;
  useEffect(() => {
    if (!usable) {
      setPhoto(null);
      return;
    }
    let live = true;
    void import("@/lib/mockup/stills")
      .then(({ plainGarmentPhoto }) => plainGarmentPhoto(catalog, design, view as "front" | "back"))
      .then((p) => live && setPhoto(p))
      .catch(() => live && setPhoto(null));
    return () => {
      live = false;
    };
    // The key covers what the plain photo depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, usable]);
  return usable ? photo : null;
}

/**
 * Editor for one side of the garment (front, back, a sleeve or the hood),
 * true to size and drawn on the garment's photo: every print on the side is
 * shown, the chosen one can be edited. Drag to move, corner square to
 * resize, top circle to rotate, snapping to the middle lines. Units are mm.
 */
export function SideEditor({
  catalog,
  design,
  print,
  bodyHex,
  onEditText,
}: {
  catalog: Catalog;
  design: DesignSelection;
  print: PrintSelection;
  bodyHex: string;
  /** A text was tapped twice: open it for typing. */
  onEditText?: (elementId: string) => void;
}) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const product = catalog.products.find((p) => p.id === design.productId);
  const side = print.areaId;
  const box = boxFor(catalog, design, print) ?? { w: 100, h: 100 };
  const pad = Math.max(box.w, box.h) * 0.06;
  const contentRef = useRef<SVGGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const editOnUp = useRef<string | null>(null);
  const [guides, setGuides] = useState({ v: false, h: false });
  const [pxPerMm, setPxPerMm] = useState(1);
  const clipId = `side-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const selection = useDesignStore((s) => s.selection);
  const measurements = useMeasureStore((s) => s.measurements);
  const onSide = design.prints.filter((p) => p.areaId === side);
  const elements = print.elements ?? [];
  const selectedId = selection?.printId === print.id ? selection.elementId : null;
  const selected = selectedId ? elements.find((e) => e.id === selectedId) : undefined;
  const handleR = 12 / pxPerMm;
  const photo = usePlainPhoto(catalog, design, side);

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

  const onElementDown = (e: ReactPointerEvent<SVGGElement>, owner: PrintSelection, el: DesignElement) => {
    e.stopPropagation();
    useDesignStore.getState().select({ printId: owner.id, elementId: el.id });
    // A second tap on the same text opens it for typing. The box is focused when the finger lifts,
    // which is when phones (iPhones especially) agree to show the keyboard.
    const now = e.timeStamp;
    const twice = lastTap.current && lastTap.current.id === el.id && now - lastTap.current.at < 450;
    lastTap.current = { id: el.id, at: now };
    if (twice && el.type === "text" && owner.id === print.id && onEditText) {
      lastTap.current = null;
      editOnUp.current = el.id;
      return;
    }
    if (el.locked || owner.id !== print.id) return;
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
    const el = findElement(d, print.id, g.id);
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
      state.setDesign(updateElement(catalog, d, print.id, el.id, { x: sx.value - cxOff, y: sy.value - cyOff }, m));
    } else if (g.kind === "resize") {
      const size = Math.max(MIN_SIZE_MM, g.startSize * (Math.hypot(p.x - el.x, p.y - el.y) / g.startDist));
      state.setDesign(updateElement(catalog, d, print.id, el.id, el.type === "text" ? { size } : { w: size }, m));
    } else {
      let deg = (Math.atan2(p.y - el.y, p.x - el.x) * 180) / Math.PI + 90;
      deg = ((((deg + 180) % 360) + 360) % 360) - 180;
      const nearest = Math.round(deg / 15) * 15;
      if (Math.abs(deg - nearest) < 4) deg = nearest;
      state.setDesign(updateElement(catalog, d, print.id, el.id, { rotation: Math.round(deg * 10) / 10 }, m));
    }
  };

  const onUp = () => {
    gesture.current = null;
    setGuides({ v: false, h: false });
    const edit = editOnUp.current;
    editOnUp.current = null;
    if (edit) onEditText?.(edit);
  };

  // Where the garment photo goes, in the panel's millimetres.
  let backdrop: { href: string; x: number; y: number; w: number; h: number } | null = null;
  if (photo && product && isPrintSide(side)) {
    const panel = sidePanel(product.mockup, design.sleeve, side);
    const px = photo.photo.px;
    const mmPerPx = 10 / px;
    let origin: [number, number] | null = null;
    if (side === "front" || side === "back") origin = [photo.photo.neck[0] - (panel.wCm / 2) * px, photo.photo.neck[1] + panel.topCm * px];
    else if (side === "hood" && photo.photo.hood) origin = [photo.photo.hood[0] - (panel.wCm / 2) * px, photo.photo.hood[1] + 11 * px - panel.topCm * px];
    if (origin) {
      const { scale, dx, dy } = photo.layout;
      backdrop = {
        href: photo.url,
        x: (-dx / scale - origin[0]) * mmPerPx,
        y: (-dy / scale - origin[1]) * mmPerPx,
        w: (photo.width / scale) * mmPerPx,
        h: (photo.height / scale) * mmPerPx,
      };
    }
  }

  const selBox = selected ? elementBBox(selected, measuredFor(selected, measurements[selected.id])) : null;
  // The print's size as priced (the same estimate the server uses).
  const bounds = printBounds(elements);
  const label = isPrintSide(side) ? tr(sideNames[side], locale) : side;

  return (
    <div className="overflow-hidden rounded-xl border border-line" style={{ backgroundColor: backdrop ? "#120b0c" : bodyHex }}>
      <svg
        viewBox={`${-pad} ${-pad} ${box.w + pad * 2} ${box.h + pad * 2}`}
        className="mx-auto block h-auto max-h-[56vh] w-full touch-none select-none"
        role="group"
        aria-label={`${label} · ${t.artwork}`}
        onPointerDown={() => useDesignStore.getState().select({ printId: print.id, elementId: null })}
      >
        <g ref={contentRef}>
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={0} width={box.w} height={box.h} />
            </clipPath>
          </defs>
          {backdrop ? <image href={backdrop.href} x={backdrop.x} y={backdrop.y} width={backdrop.w} height={backdrop.h} preserveAspectRatio="none" pointerEvents="none" /> : null}
          <rect x={0} y={0} width={box.w} height={box.h} fill="rgba(255,255,255,0.03)" stroke="#E2C766" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <g clipPath={`url(#${clipId})`}>
            {onSide.map((owner) => {
              const active = owner.id === print.id;
              return (
                <g key={owner.id} opacity={active ? 1 : 0.5}>
                  {(owner.elements ?? []).map((el) => (
                    <g
                      key={el.id}
                      transform={`translate(${el.x} ${el.y}) rotate(${el.rotation})`}
                      role="button"
                      tabIndex={active ? 0 : -1}
                      aria-pressed={active && el.id === selectedId}
                      aria-label={el.type === "text" ? el.text : el.type === "image" ? el.name : t.clipartLayer}
                      onPointerDown={(e) => onElementDown(e, owner, el)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={onUp}
                      onKeyDown={(e) => e.key === "Enter" && useDesignStore.getState().select({ printId: owner.id, elementId: el.id })}
                      style={{ cursor: active ? (el.locked ? "pointer" : "move") : "pointer", touchAction: "none", outline: "none" }}
                    >
                      <ElementShape el={el} missingLabel={t.missingImage} />
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
          {bounds ? (
            <g pointerEvents="none">
              <rect x={bounds.x - 2} y={bounds.y - 2} width={bounds.w + 4} height={bounds.h + 4} fill="none" stroke="#E2C766" strokeWidth={1.2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <text x={bounds.x - 2} y={bounds.y - 2 - 6 / pxPerMm} fontSize={11 / pxPerMm} fill="#E2C766" fontFamily="sans-serif" fontWeight={600}>
                {`${Math.round(bounds.w / 10)} × ${Math.round(bounds.h / 10)} cm · ${tr(tierLabels[print.tier], locale)}`}
              </text>
            </g>
          ) : null}
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
