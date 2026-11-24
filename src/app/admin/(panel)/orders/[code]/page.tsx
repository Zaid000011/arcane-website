import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamOrderView } from "@/components/admin/TeamOrderView";
import { googleFontsHref } from "@/lib/design/fonts";
import { getLiveCatalog } from "@/server/catalog-store";
import { OrderError, getAdminOrder } from "@/server/orders";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Order ${(await params).code.toUpperCase()}` };
}

export default async function TeamOrderPage({ params }: Props) {
  const user = await requirePageUser("orders.view");
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
      <TeamOrderView order={data.order} notes={data.notes} attention={data.attention} next={data.next} catalog={getLiveCatalog()} user={user} />
    </>
  );
}
