import type { Metadata } from "next";
import { PriceEditor } from "@/components/admin/PriceEditor";
import { priceSheetOf } from "@/lib/catalog/price-sheet";
import { catalogVersions, getLiveCatalog } from "@/server/catalog-store";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prices & sizes" };

export default async function PricesPage() {
  await requirePageUser("prices.edit");
  const catalog = getLiveCatalog();
  return <PriceEditor catalog={catalog} sheet={priceSheetOf(catalog)} versions={catalogVersions()} />;
}
