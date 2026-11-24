"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dirOf, LOCALE_COOKIE } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, dict } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = locale === "en" ? "ar" : "en";

  function toggle() {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = dirOf(next);
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={dict.nav.switchLanguageLabel}
      lang={next}
      className={`inline-flex items-center gap-1.5 rounded-full border border-gold/30 px-3 py-1.5 text-sm text-cream transition-colors hover:border-gold hover:text-gold disabled:opacity-60 ${className}`}
    >
      <Languages className="h-4 w-4" aria-hidden />
      <span className={next === "ar" ? "font-[family-name:var(--font-cairo)]" : "font-[family-name:var(--font-inter)]"}>
        {dict.nav.switchLanguage}
      </span>
    </button>
  );
}
