"use client";

import { useEffect, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import { hasPhotos } from "@/lib/mockup/photos";
import type { DesignSelection } from "@/lib/pricing/types";
import type { PrintSamples } from "@/lib/three/print-layers";
import type { StageView } from "@/lib/three/stage";

/**
 * A still picture of a design: the real garment photo for front and back
 * views, the 3D garment for sleeve views (or if the photo can't load). Shows a
 * soft placeholder while it's drawn.
 */
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
    const product = catalog.products.find((p) => p.id === design.productId) ?? catalog.products[0];
    const render3d = () => import("@/lib/three/snapshots").then(({ renderGarmentImage }) => renderGarmentImage(catalog, design, view, width, height, samples));
    const photo = (view === "front" || view === "back") && product && hasPhotos(product.mockup, design.sleeve);
    const picture = photo
      ? import("@/lib/mockup/stills")
          .then(({ renderPhotoImage }) => renderPhotoImage(catalog, design, view, width, height, samples))
          .then((url) => url ?? render3d())
          .catch(() => render3d())
      : render3d();
    void picture.then((url) => alive && setSrc(url)).catch(() => undefined);
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
