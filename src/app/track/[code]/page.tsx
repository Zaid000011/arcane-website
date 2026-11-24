import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrackView } from "@/components/order/TrackView";
import { getLiveCatalog } from "@/server/catalog-store";
import { googleFontsHref } from "@/lib/design/fonts";
import { getDictionary, getLocale } from "@/i18n/server";
import { orderExists } from "@/server/orders";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.order.metaTitle, robots: { index: false, follow: false } };
}

/** The private order page. The details load in the browser with the key from the link, never from the server render. */
export default async function TrackPage({ params }: Props) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{4,12}$/.test(code) || !orderExists(code)) notFound();
  return (
    <>
      <link rel="stylesheet" href={googleFontsHref} precedence="default" />
      <TrackView code={code.toUpperCase()} catalog={getLiveCatalog()} />
    </>
  );
}
