"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useCartReady, useCartStore } from "@/lib/cart/store";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";

export function CartButton() {
  const { dict } = useI18n();
  const ready = useCartReady();
  const count = useCartStore((s) => s.items.length);
  const shown = ready ? count : 0;
  return (
    <Link
      href="/cart"
      aria-label={shown ? fmt(dict.nav.cartWithCount, { count: shown }) : dict.nav.cart}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 text-cream transition-colors hover:border-gold hover:text-gold"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden />
      {shown ? (
        <span className="absolute -end-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-ink">{shown}</span>
      ) : null}
    </Link>
  );
}
