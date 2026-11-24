import type { Metadata } from "next";
import Link from "next/link";
import { ATTENTION_LABEL, Badge, money, PaymentBadge, StatusBadge, when } from "@/components/admin/ui";
import { listOrders, type OrderListView } from "@/server/orders";
import { requirePageUser } from "@/server/team-http";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders" };

const VIEWS: { id: OrderListView; label: string }[] = [
  { id: "action", label: "Needs action" },
  { id: "open", label: "Open" },
  { id: "done", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const DELIVERY_LABEL = { delivery: "Home delivery", school: "School / university", pickup: "Pickup" } as const;

type Props = { searchParams: Promise<{ q?: string; view?: string; page?: string }> };

export default async function OrdersPage({ searchParams }: Props) {
  await requirePageUser("orders.view");
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.id === sp.view) ? (sp.view as OrderListView) : "open";
  const q = (sp.q ?? "").slice(0, 60);
  const data = listOrders({ q, view, page: Number(sp.page) || 1 });
  const href = (over: Record<string, string | number>) => {
    const params = new URLSearchParams({ view, ...(q ? { q } : {}), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    return `/admin/orders?${params}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl tracking-wide uppercase">Orders</h1>
        <form method="get" action="/admin/orders" className="flex w-full max-w-md gap-2">
          <input type="hidden" name="view" value={view} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by order code, name or phone"
            aria-label="Search orders"
            className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm text-cream placeholder:text-cream-muted/60 focus:border-gold focus:outline-none"
          />
          <button type="submit" className="rounded-lg border border-gold/50 px-4 py-2 text-sm text-cream hover:bg-gold/10">
            Search
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Payment screenshots to check", n: data.counts.payment },
          { label: "Proofs to send", n: data.counts.proof },
          { label: "Ready to make", n: data.counts.production },
        ].map((c) => (
          <Link key={c.label} href="/admin/orders?view=action" className={`rounded-2xl border p-4 ${c.n ? "border-gold/50 bg-arcane/25 hover:bg-arcane/40" : "border-line bg-ink-2/70"}`}>
            <p className="font-display text-3xl text-gold">{c.n}</p>
            <p className="text-sm text-cream-muted">{c.label}</p>
          </Link>
        ))}
      </div>

      <nav aria-label="Order views" className="flex flex-wrap gap-1 border-b border-line">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={href({ view: v.id, page: 1 })}
            aria-current={v.id === view ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${v.id === view ? "border-gold text-cream" : "border-transparent text-cream-muted hover:text-cream"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-line p-8 text-center text-cream-muted">{q ? "No orders match your search." : "No orders here yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-ink-2 text-left text-xs text-cream-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Placed</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Pieces</th>
                <th className="px-4 py-3 font-semibold">Total / paid</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold">To do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((r) => (
                <tr key={r.code} className="hover:bg-gold/5">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${r.code}`} className="font-semibold text-gold hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-cream-muted">{when(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="block text-cream" dir="auto">
                      {r.customerName}
                    </span>
                    <span className="text-xs text-cream-muted">
                      {r.customerPhone} · {DELIVERY_LABEL[r.delivery]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-cream">{r.pieces}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="block text-cream">{money(r.total)}</span>
                    <span className="text-xs text-cream-muted">{money(r.paid)} paid</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={r.paymentStatus} />
                  </td>
                  <td className="px-4 py-3">{r.attention ? <Badge tone="gold">{ATTENTION_LABEL[r.attention]}</Badge> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          <span className="text-cream-muted">
            Page {data.page} of {data.pages} · {data.total} orders
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
