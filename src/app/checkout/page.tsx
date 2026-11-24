import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { getLiveCatalog } from "@/server/catalog-store";
import { googleFontsHref } from "@/lib/design/fonts";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.checkout.metaTitle, robots: { index: false, follow: false } };
}

export default function CheckoutPage() {
  return (
    <>
      {/* Fonts used by text on the designs. */}
      <link rel="stylesheet" href={googleFontsHref} precedence="default" />
      <CheckoutView catalog={getLiveCatalog()} />
    </>
  );
}
