import type { Metadata } from "next";
import { Designer } from "@/components/designer/Designer";
import { getLiveCatalog } from "@/server/catalog-store";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.designer.metaTitle };
}

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  return <Designer catalog={getLiveCatalog()} initialProductId={typeof product === "string" ? product : undefined} />;
}
