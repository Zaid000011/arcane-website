import type { Metadata } from "next";
import { Designer } from "@/components/designer/Designer";
import { STATIC_SITE } from "@/lib/site-mode";
import { getLiveCatalog } from "@/server/catalog-store";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.designer.metaTitle };
}

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  // The GitHub Pages copy is built ahead of time, so the designer reads ?product= itself.
  const { product } = STATIC_SITE ? { product: undefined } : await searchParams;
  return <Designer catalog={getLiveCatalog()} initialProductId={typeof product === "string" ? product : undefined} />;
}
