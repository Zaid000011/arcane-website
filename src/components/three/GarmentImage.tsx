"use client";

import { useEffect, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import type { StageView } from "@/lib/three/stage";

/** A still 3D picture of a design. Shows a soft placeholder while it's drawn. */
export function GarmentImage({
  catalog,
  design,
  view = "front",
  width = 420,
  height = 480,
  samples,
  className = "",
  alt,
}: {
  catalog: Catalog;
  design: DesignSelection;
  view?: StageView;
  width?: number;
  height?: number;
  samples?: PrintSamples;
  className?: string;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify([design, view, samples ?? null, width, height]);

  useEffect(() => {
    let alive = true;
    void import("@/lib/three/snapshots")
      .then(({ renderGarmentImage }) => renderGarmentImage(catalog, design, view, width, height, samples))
      .then((url) => alive && setSrc(url))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // The key covers design, view, samples and size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, catalog]);

  if (!src) return <div className={`animate-pulse rounded-xl bg-gold/5 ${className}`} style={{ aspectRatio: `${width} / ${height}` }} aria-busy="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={width} height={height} className={className} />;
}
