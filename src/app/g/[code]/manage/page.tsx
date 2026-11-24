import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupManage } from "@/components/group/GroupManage";
import { getLiveCatalog } from "@/server/catalog-store";
import { googleFontsHref } from "@/lib/design/fonts";
import { getDictionary, getLocale } from "@/i18n/server";
import { getPublicGroup } from "@/server/groups";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await getLocale());
  return { title: dict.group.manageTitle, robots: { index: false, follow: false } };
}

export default async function ManageGroupPage({ params }: Props) {
  const { code } = await params;
  if (!getPublicGroup(code)) notFound();
  return (
    <>
      <link rel="stylesheet" href={googleFontsHref} precedence="default" />
      <GroupManage code={code.toUpperCase()} catalog={getLiveCatalog()} />
    </>
  );
}
