"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A pop-up window on top of the page (the browser's own <dialog>: it keeps
 * keyboard focus inside and closes with Escape). Clicking outside closes it,
 * except for forms, where a stray click shouldn't throw away what was typed.
 * What's inside stays put between openings.
 */
export function Modal({
  open,
  onClose,
  title,
  closeLabel,
  wide,
  dismissOnBackdrop = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  wide?: boolean;
  dismissOnBackdrop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) return;
    // Keep the page behind from scrolling while the window is open.
    const before = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = before;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === ref.current) onClose();
      }}
      className={`modal m-auto max-h-[min(92dvh,56rem)] w-[calc(100%-1.5rem)] overflow-hidden rounded-2xl border border-gold/40 bg-ink-2 p-0 text-cream shadow-[0_30px_80px_rgba(0,0,0,0.7)] backdrop:bg-black/75 backdrop:backdrop-blur-sm ${wide ? "max-w-4xl" : "max-w-2xl"}`}
    >
      {mounted ? (
        <div className="flex max-h-[min(92dvh,56rem)] flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 id={titleId} className="font-display text-2xl tracking-wide text-cream uppercase sm:text-3xl">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-cream-muted hover:border-gold hover:text-gold"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
