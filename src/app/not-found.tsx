import Link from "next/link";
import { Star } from "@/components/brand/Star";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function NotFound() {
  const dict = getDictionary(await getLocale());
  const isAr = dict.nav.cart === "السلة";
  return (
    <div className="section flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <Star className="h-10 w-10 text-gold" />
      <h1 className="mt-4 font-display text-5xl tracking-wide uppercase">404</h1>
      <p className="mt-2 text-cream-muted">{isAr ? "هذه الصفحة غير موجودة." : "This page doesn't exist."}</p>
      <Link href="/" className="btn btn-primary mt-6">
        {isAr ? "الصفحة الرئيسية" : "Go home"}
      </Link>
    </div>
  );
}
