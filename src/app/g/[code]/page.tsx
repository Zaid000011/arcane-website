import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupJoin } from "@/components/group/GroupJoin";
import { getLiveCatalog } from "@/server/catalog-store";
import { googleFontsHref } from "@/lib/design/fonts";
import { fmt } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { getPublicGroup } from "@/server/groups";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const dict = getDictionary(await getLocale());
  const group = getPublicGroup(code);
  if (!group) return { title: dict.group.errors.notFound, robots: { index: false } };
  const description = fmt(dict.group.organizerPays, { name: group.organizerFirstName });
  return {
    title: `${group.name} · ${dict.group.joinTitle}`,
    description,
    robots: { index: false },
    openGraph: { title: group.name, description: dict.group.joinTitle },
  };
}

export default async function GroupPage({ params }: Props) {
  const { code } = await params;
  const group = getPublicGroup(code);
  if (!group) notFound();
  return (
    <>
      <link rel="stylesheet" href={googleFontsHref} precedence="default" />
      <GroupJoin group={group} catalog={getLiveCatalog()} />
    </>
  );
}
