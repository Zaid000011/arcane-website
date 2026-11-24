import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { getLiveCatalog } from "@/server/catalog-store";
import { googleFontsHref } from "@/lib/design/fonts";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.cart.metaTitle };
}

export default function CartPage() {
  return (
    <>
      {/* Fonts used by text on the designs. */}
      <link rel="stylesheet" href={googleFontsHref} precedence="default" />
      <CartView catalog={getLiveCatalog()} />
    </>
  );
}
