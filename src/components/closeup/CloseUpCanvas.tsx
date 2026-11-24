"use client";

import { useEffect, useRef } from "react";

/** Shows a drawn close-up, filling its (usually round) frame. Fades in when the picture changes. */
export function CloseUpCanvas({ image, className = "" }: { image: ImageData | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !image) return;
    if (c.width !== image.width) c.width = image.width;
    if (c.height !== image.height) c.height = image.height;
    c.getContext("2d")?.putImageData(image, 0, 0);
    c.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  }, [image]);
  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${image ? "" : "animate-pulse bg-gold/10"} ${className}`} />;
}
