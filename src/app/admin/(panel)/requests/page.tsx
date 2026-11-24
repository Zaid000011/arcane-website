import type { Metadata } from "next";
import Link from "next/link";
import { RequestCard } from "@/components/admin/RequestCard";
import { closestColor } from "@/lib/color-match";
import { getLiveCatalog } from "@/server/catalog-store";
import { listRequests, type RequestListView } from "@/server/requests";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Requests" };

type Props = { searchParams: Promise<{ view?: string; page?: string }> };

export default async function RequestsPage({ searchParams }: Props) {
  await requirePageUser("requests.manage");
  const sp = await searchParams;
  const views: { id: RequestListView; label: string }[] = [
    { id: "new", label: "New" },
    { id: "contacted", label: "Contacted" },
    { id: "done", label: "Done" },
    { id: "all", label: "All" },
  ];
  const view = views.some((v) => v.id === sp.view) ? (sp.view as RequestListView) : "new";
  const data = listRequests({ view, page: Number(sp.page) || 1 });
  const catalog = getLiveCatalog();
  const href = (over: Record<string, string | number>) => `/admin/requests?${new URLSearchParams({ view, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) })}`;
  const count: Partial<Record<RequestListView, number>> = { new: data.counts.new, contacted: data.counts.contacted, done: data.counts.done };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-wide uppercase">Requests</h1>
        <p className="mt-1 max-w-2xl text-sm text-cream-muted">
          Designs, colors and sizes customers sent with the &ldquo;send it to us&rdquo; buttons. Reply on WhatsApp, then mark each one so the team knows it&rsquo;s handled.
        </p>
      </div>

      <nav aria-label="Request views" className="flex flex-wrap gap-1 border-b border-line">
        {views.map((v) => (
          <Link
            key={v.id}
            href={href({ view: v.id, page: 1 })}
            aria-current={v.id === view ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${v.id === view ? "border-gold text-cream" : "border-transparent text-cream-muted hover:text-cream"}`}
          >
            {v.label}
            {count[v.id] ? <span className="ms-1.5 rounded-full bg-gold/15 px-1.5 text-xs text-gold-light">{count[v.id]}</span> : null}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-line p-8 text-center text-cream-muted">{view === "new" ? "No new requests. You're all caught up." : "Nothing here yet."}</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.rows.map((r) => {
            const product = catalog.products.find((p) => p.id === r.productId);
            const match = r.color ? closestColor(r.color.hex, catalog.colors) : null;
            return (
              <RequestCard
                key={r.code}
                request={r}
                productName={product ? product.name.en : null}
                closest={match ? { name: match.color.name.en, hex: match.color.hex.toUpperCase(), distance: match.distance } : null}
              />
            );
          })}
        </div>
      )}

      {data.pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <span className="text-cream-muted">
            Page {data.page} of {data.pages} · {data.total} requests
          </span>
          <span className="flex gap-2">
            {data.page > 1 ? (
              <Link href={href({ page: data.page - 1 })} className="rounded-lg border border-line px-3 py-1.5 text-cream hover:border-gold">
                Previous
              </Link>
            ) : null}
            {data.page < data.pages ? (
              <Link href={href({ page: data.page + 1 })} className="rounded-lg border border-line px-3 py-1.5 text-cream hover:border-gold">
                Next
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
