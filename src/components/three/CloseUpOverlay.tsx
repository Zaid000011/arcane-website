"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CloseUpCanvas } from "@/components/closeup/CloseUpCanvas";
import { tr } from "@/lib/catalog";
import type { Catalog, FabricOption } from "@/lib/catalog/types";
import { artFrom, closeUpFabric, closeUpSize, fitArt, sampleArt, useCloseUp } from "@/lib/closeup/client";
import { hasDistinctInside } from "@/lib/closeup/surface";
import { useMeasureStore } from "@/lib/design/measure-store";
import { isPrintSide, panelBox, printRenderRect, renderPad } from "@/lib/design/sides";
import type { DesignSelection, PrintSelection } from "@/lib/pricing/types";
import { printPhotoUrl } from "@/lib/print-photos";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { bodyHex } from "@/lib/design/options";

/** What the close-up shows: the fabric under a magnifying glass, or one print area pulled out into a circle. */
export type CloseUpView = { type: "fabric" } | { type: "print"; printId: string };

/** The garment picture a close-up points into: the 3D garment or the photo. */
export interface CloseUpTarget {
  /** The element showing the garment (the close-up covers it). */
  element(): HTMLElement | null;
  /** Where the middle of a print shows (CSS pixels from the element's corner), and whether it faces the viewer. */
  locate(print: PrintSelection, design: DesignSelection): { x: number; y: number; facing: boolean } | null;
  /** Calls `fn` whenever the picture moves or is redrawn. Returns a function that stops it. */
  subscribe(fn: () => void): () => void;
  /** Asks for a redraw soon. */
  refresh(): void;
}

const PATCHES: Record<string, "woven" | "chenille"> = { wovenPatch: "woven", chenillePatch: "chenille" };

export function CloseUpOverlay({ target, view, catalog, design }: { target: CloseUpTarget; view: CloseUpView; catalog: Catalog; design: DesignSelection }) {
  const product = catalog.products.find((p) => p.id === design.productId);
  const fabric = product?.fabrics.find((f) => f.id === design.fabricId) ?? product?.fabrics[0];
  const color = bodyHex(catalog, design);
  if (!fabric) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden [container-type:size]" aria-hidden>
      {view.type === "fabric" ? (
        <FabricLens fabric={fabric} color={color} />
      ) : design.prints.some((p) => p.id === view.printId) ? (
        <PrintCallout key={view.printId} target={target} catalog={catalog} design={design} printId={view.printId} fabric={fabric} color={color} />
      ) : null}
    </div>
  );
}

/** Watches an element's width, so the close-up is drawn at the size it's shown. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w / 16) * 16 || 16);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/* ---------- fabric: a magnifying glass over the garment ---------- */

function FabricLens({ fabric, color }: { fabric: FabricOption; color: string }) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const [ref, width] = useWidth<HTMLDivElement>(220);
  const size = closeUpSize(width);
  const outKey = `${fabric.id}|${fabric.kind}|${color}|${size}`;
  const outside = useCloseUp(outKey, async () => ({ key: `fabric|out|${outKey}`, job: { type: "fabric", fabricId: fabric.id, kind: fabric.kind, color, size, side: "outside" } }));
  const showInside = hasDistinctInside(fabric.id, fabric.kind);
  const smallSize = closeUpSize(width * 0.4, 192);
  const inKey = showInside ? `${fabric.id}|${fabric.kind}|${color}|${smallSize}` : null;
  const inside = useCloseUp(inKey, async () => ({ key: `fabric|in|${inKey}`, job: { type: "fabric", fabricId: fabric.id, kind: fabric.kind, color, size: smallSize, side: "inside" } }));

  return (
    <div className="closeup-pop absolute end-[5%] top-[20%] flex w-[min(42cqw,56cqh,15rem)] flex-col items-end">
      <p className="mb-2 inline-flex w-max max-w-[80cqw] items-center gap-1.5 rounded-full border border-gold/40 bg-ink/85 px-2.5 py-1 text-[11px] font-semibold text-gold-light shadow-lg">
        <Search className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{fmt(t.upClose, { name: tr(fabric.name, locale) })}</span>
      </p>
      <div ref={ref} className="relative aspect-square w-full">
        <span className="lens-handle" />
        <div className="lens-glass absolute inset-0 overflow-hidden rounded-full">
          <CloseUpCanvas image={outside} />
          <span className="lens-glare" />
        </div>
        {showInside ? (
          <div className="absolute -start-[14%] bottom-[-12%] w-[42%]">
            <div className="lens-glass lens-glass-small aspect-square overflow-hidden rounded-full">
              <CloseUpCanvas image={inside} />
            </div>
            <span className="mx-auto mt-1 block w-fit rounded-full bg-ink/85 px-2 py-0.5 text-center text-[10px] font-semibold text-cream">{t.inside}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- print: a circle on the garment, stretched out into a big close-up ---------- */

const RING = 13;

function hashString(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function PrintCallout({
  target,
  catalog,
  design,
  printId,
  fabric,
  color,
}: {
  target: CloseUpTarget;
  catalog: Catalog;
  design: DesignSelection;
  printId: string;
  fabric: FabricOption;
  color: string;
}) {
  const { locale, dict } = useI18n();
  const t = dict.designer;
  const print = design.prints.find((p) => p.id === printId)!;
  const product = catalog.products.find((p) => p.id === design.productId);
  const method = catalog.printMethods.find((m) => m.id === print.methodId);
  // The latest print and design, for placing the callout as the garment redraws.
  const latest = useRef({ print, design });
  latest.current = { print, design };
  const elements = print.elements ?? [];
  const own = elements.length > 0;
  const box = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const lines = useRef<SVGGElement>(null);
  const [diameter, setDiameter] = useState(180);

  // The customer's own artwork, drawn up close in the print type's finish, on a fabric the method really works on
  // (sublimation needs light polyester, DTG needs cotton). Only while the print is still empty does the real photo
  // of the print type show instead, as in "Print types explained".
  const photo = own ? null : printPhotoUrl(print.methodId);
  const base = method ? closeUpFabric(method, fabric, color) : { fabricId: fabric.id, kind: fabric.kind, color };
  const size = closeUpSize(diameter);
  const artKey = own ? hashString(JSON.stringify(elements)) : "sample";
  const key = photo ? null : `${print.methodId}|${base.fabricId}|${base.kind}|${base.color}|${size}|${artKey}`;
  const image = useCloseUp(key, async () => {
    let art: HTMLCanvasElement | null = null;
    let viewMm: number | undefined;
    if (own && product && isPrintSide(print.areaId)) {
      const { drawPrintRect } = await import("@/lib/three/print-canvas");
      const patch = PATCHES[print.methodId] ?? null;
      const rect = printRenderRect(elements, panelBox(product.mockup, design.sleeve, print.areaId), useMeasureStore.getState().measurements, renderPad(Boolean(patch)));
      const full = await drawPrintRect(elements, rect, patch);
      // The whole design, so what's written can be read, in this print type's finish.
      const fitted = fitArt(full, rect.w, rect.h, size);
      art = fitted.canvas;
      viewMm = fitted.viewMm;
    }
    art ??= sampleArt(print.methodId, base.color, size);
    return { key: `print|${key}`, job: { type: "print", methodId: print.methodId, fabricId: base.fabricId, kind: base.kind, color: base.color, size, art: artFrom(art, size), ...(viewMm ? { viewMm } : {}) } };
  });

  // Follow the print area while the garment turns: the small ring sits on it and two lines stretch out to the big circle.
  useEffect(() => {
    let side: "left" | "right" | null = null;
    const place = () => {
      const el = target.element();
      const w = el?.clientWidth ?? 0;
      const h = el?.clientHeight ?? 0;
      if (!w || !h || !box.current || !lines.current || !caption.current) return;
      const D = Math.round(Math.min(h * 0.46, w * 0.42, 230));
      const R = D / 2;
      const pr = target.locate(latest.current.print, latest.current.design);
      // The big circle goes on the side away from the print, and stays there while turning.
      side ??= pr && pr.x > w / 2 ? "left" : "right";
      const cx = side === "right" ? w - R - 14 : R + 14;
      const cy = h - R - 36;
      box.current.style.width = box.current.style.height = `${D}px`;
      box.current.style.transform = `translate(${cx - R}px, ${cy - R}px)`;
      caption.current.style.transform = `translate(${cx}px, ${cy - R - 8}px) translate(-50%, -100%)`;
      if (Math.abs(D - diameter) > 24) setDiameter(D);

      const g = lines.current;
      const d = pr ? Math.hypot(cx - pr.x, cy - pr.y) : 0;
      if (!pr || !pr.facing || d <= R + RING + 6) {
        g.style.opacity = "0";
        return;
      }
      g.style.opacity = "1";
      const theta = Math.atan2(cy - pr.y, cx - pr.x);
      const phi = Math.acos((RING - R) / d);
      const [ringOuter, ring, l1a, l1b, l2a, l2b] = Array.from(g.children) as SVGElement[];
      for (const c of [ringOuter, ring]) {
        c!.setAttribute("cx", String(pr.x));
        c!.setAttribute("cy", String(pr.y));
      }
      [
        [l1a, l1b, 1],
        [l2a, l2b, -1],
      ].forEach(([under, over, sgn]) => {
        const a = theta + (sgn as number) * phi;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        for (const line of [under as SVGElement, over as SVGElement]) {
          line.setAttribute("x1", String(pr.x + RING * nx));
          line.setAttribute("y1", String(pr.y + RING * ny));
          line.setAttribute("x2", String(cx + R * nx));
          line.setAttribute("y2", String(cy + R * ny));
        }
      });
    };
    place();
    const stop = target.subscribe(place);
    target.refresh();
    return stop;
    // `diameter` only resizes the picture; placing doesn't depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, printId]);

  return (
    <>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <g ref={lines} style={{ opacity: 0 }} className="transition-opacity duration-200">
          <circle r={RING + 1.5} fill="none" stroke="rgba(20,10,11,0.75)" strokeWidth="4" />
          <circle r={RING} fill="rgba(226,199,102,0.12)" stroke="#e2c766" strokeWidth="2" />
          <line stroke="rgba(20,10,11,0.7)" strokeWidth="3.5" strokeLinecap="round" />
          <line className="callout-line" pathLength={1} stroke="#e2c766" strokeWidth="1.5" strokeLinecap="round" />
          <line stroke="rgba(20,10,11,0.7)" strokeWidth="3.5" strokeLinecap="round" />
          <line className="callout-line" pathLength={1} stroke="#e2c766" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      </svg>
      <div ref={box} className="absolute top-0 left-0" style={{ width: 0, height: 0 }}>
        <div className="closeup-pop lens-glass h-full w-full overflow-hidden rounded-full">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo} src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <CloseUpCanvas image={image} />
          )}
          <span className="lens-glare" />
        </div>
      </div>
      <p ref={caption} className="absolute top-0 left-0 w-max max-w-[60cqw] rounded-full border border-gold/40 bg-ink/85 px-2.5 py-1 text-center text-[11px] leading-tight font-semibold text-gold-light shadow-lg">
        {fmt(t.upClose, { name: method ? tr(method.name, locale) : "" })}
        <span className="block text-[10px] font-normal text-cream-muted">{photo ? t.realPhoto : own ? t.yourDesign : t.exampleDesign}</span>
      </p>
    </>
  );
}
