import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkshopSheet } from "@/components/admin/WorkshopSheet";
import { googleFontsHref } from "@/lib/design/fonts";
import { getLiveCatalog } from "@/server/catalog-store";
import { OrderError, getAdminOrder } from "@/server/orders";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Workshop sheet ${(await params).code.toUpperCase()}` };
}

export default async function WorkshopSheetPage({ params }: Props) {
  await requirePageUser("orders.view");
  const { code } = await params;
  let data: ReturnType<typeof getAdminOrder>;
  try {
    data = getAdminOrder(code);
  } catch (e) {
    if (e instanceof OrderError && e.code === "notFound") notFound();
    throw e;
  }
  return (
    <>
      <link rel="stylesheet" href={googleFontsHref} precedence="default" />
      <WorkshopSheet order={data.order} notes={data.notes} catalog={getLiveCatalog()} />
    </>
  );
}
