"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useAssetUrl } from "@/lib/design/assets";
import { clipartById } from "@/lib/design/clipart";
import { fontById, hasArabic } from "@/lib/design/fonts";
import { textShapeKey, type TextMeasurement } from "@/lib/design/geometry";
import { useMeasureStore } from "@/lib/design/measure-store";
import type { DesignElement, ImageElement, TextElement } from "@/lib/design/types";

/** Draws one piece of artwork centered on 0,0 in millimetres. */
export function ElementShape({ el, missingLabel }: { el: DesignElement; missingLabel: string }) {
  if (el.type === "image") return <ImageShape el={el} missingLabel={missingLabel} />;
  if (el.type === "text") return <TextShape el={el} />;
  const art = clipartById(el.clipartId);
  return <g transform={`scale(${el.w})`}>{art?.render(el.color)}</g>;
}

function ImageShape({ el, missingLabel }: { el: ImageElement; missingLabel: string }) {
  const url = useAssetUrl(el.assetId);
  const [missing, setMissing] = useState(false);
  const h = el.w * el.aspect;

  useEffect(() => {
    if (url) return setMissing(false);
    const timer = setTimeout(() => setMissing(true), 1500);
    return () => clearTimeout(timer);
  }, [url]);

  if (!url) {
    return (
      <g>
        <rect x={-el.w / 2} y={-h / 2} width={el.w} height={h} fill="rgba(201,162,39,0.12)" stroke="#E2C766" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        {missing ? (
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(el.w, h) / 8} fill="#F5EBD8">
            {missingLabel}
          </text>
        ) : null}
      </g>
    );
  }
  return <image href={url} x={-el.w / 2} y={-h / 2} width={el.w} height={h} preserveAspectRatio="none" />;
}

/** Re-render text once web fonts finish loading so measurements use the real font. */
function useFontsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    const bump = () => setVersion((v) => v + 1);
    document.fonts.addEventListener("loadingdone", bump);
    void document.fonts.ready.then(bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, []);
  return version;
}

function arcPath(width: number, curve: number, size: number): string {
  const theta = (Math.abs(curve) / 100) * Math.PI * 1.5;
  const r = Math.max(width, 1) / theta;
  const span = Math.min(theta * 1.2 + 0.05, Math.PI * 1.95);
  const sx = r * Math.sin(span / 2);
  const dy = r - r * Math.cos(span / 2);
  const large = span > Math.PI ? 1 : 0;
  const offset = size * 0.35;
  return curve > 0
    ? `M${-sx},${dy + offset} A${r},${r} 0 ${large},1 ${sx},${dy + offset}`
    : `M${-sx},${-dy + offset} A${r},${r} 0 ${large},0 ${sx},${-dy + offset}`;
}

function TextShape({ el }: { el: TextElement }) {
  const font = fontById(el.fontId);
  const rtl = hasArabic(el.text);
  const spacing = rtl ? 0 : el.letterSpacing * el.size;
  const fontsVersion = useFontsVersion();
  const measureRef = useRef<SVGTextElement>(null);
  const visibleRef = useRef<SVGTextElement>(null);
  const [naturalWidth, setNaturalWidth] = useState(el.text.length * el.size * 0.6);
  const pathId = `arc-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const lastReported = useRef<TextMeasurement | null>(null);

  const common = {
    fontSize: el.size,
    fontWeight: font.weight,
    letterSpacing: spacing,
    style: { fontFamily: font.family },
    direction: rtl ? ("rtl" as const) : ("ltr" as const),
  };
  const paint = {
    fill: el.color,
    stroke: el.outline ? el.outlineColor : "none",
    strokeWidth: el.outline ? el.size * (el.outline === 1 ? 0.06 : 0.12) : 0,
    strokeLinejoin: "round" as const,
    paintOrder: "stroke",
  };

  useLayoutEffect(() => {
    const straight = measureRef.current;
    if (straight) {
      const w = straight.getComputedTextLength();
      if (w > 0 && Math.abs(w - naturalWidth) > 0.05) setNaturalWidth(w);
    }
    const shown = visibleRef.current;
    if (!shown) return;
    const b = shown.getBBox();
    if (b.width <= 0) return;
    const next: TextMeasurement = { bbox: { x: b.x, y: b.y, w: b.width, h: b.height }, size: el.size, shapeKey: textShapeKey(el) };
    const prev = lastReported.current;
    const same =
      prev &&
      prev.shapeKey === next.shapeKey &&
      prev.size === next.size &&
      Math.abs(prev.bbox.x - next.bbox.x) < 0.05 &&
      Math.abs(prev.bbox.y - next.bbox.y) < 0.05 &&
      Math.abs(prev.bbox.w - next.bbox.w) < 0.05 &&
      Math.abs(prev.bbox.h - next.bbox.h) < 0.05;
    if (!same) {
      lastReported.current = next;
      useMeasureStore.getState().setMeasurement(el.id, next);
    }
  });

  void fontsVersion;

  return (
    <>
      <text ref={measureRef} {...common} opacity={0} pointerEvents="none" aria-hidden>
        {el.text}
      </text>
      {el.curve === 0 ? (
        <text ref={visibleRef} {...common} {...paint} x={0} y={0} textAnchor="middle" dominantBaseline="central">
          {el.text}
        </text>
      ) : (
        <>
          <defs>
            <path id={pathId} d={arcPath(naturalWidth, el.curve, el.size)} />
          </defs>
          <text ref={visibleRef} {...common} {...paint}>
            <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
              {el.text}
            </textPath>
          </text>
        </>
      )}
    </>
  );
}
