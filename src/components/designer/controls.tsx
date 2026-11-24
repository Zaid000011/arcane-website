"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { isLightHex } from "@/components/garment/color";

export function Swatch({
  hex,
  label,
  selected,
  disabled,
  size = "md",
  onSelect,
}: {
  hex: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  onSelect: () => void;
}) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`relative inline-flex ${dim} shrink-0 items-center justify-center rounded-full border border-black/40 ring-offset-2 ring-offset-ink transition-transform hover:scale-110 disabled:cursor-not-allowed disabled:opacity-30 aria-pressed:ring-2 aria-pressed:ring-gold`}
      style={{ backgroundColor: hex }}
    >
      {selected ? <Check className={`h-4 w-4 ${isLightHex(hex) ? "text-ink" : "text-cream"}`} aria-hidden /> : null}
    </button>
  );
}

/** Selectable card/pill. Uses aria-pressed so screen readers announce the selection. */
export function Choice({
  selected,
  onSelect,
  children,
  className = "",
  muted,
  ariaLabel,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
  muted?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onSelect}
      className={`rounded-xl border px-3 py-2.5 text-start transition-colors ${
        selected ? "border-gold bg-gold/10 text-cream" : "border-line bg-ink-2/60 text-cream-muted hover:border-gold/50 hover:text-cream"
      } ${muted ? "opacity-55" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="font-serif text-sm font-bold tracking-wider text-gold uppercase">{children}</h3>
      {hint ? <span className="text-xs text-cream-muted">{hint}</span> : null}
    </div>
  );
}
