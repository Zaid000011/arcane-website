"use client";

import { useEffect, useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests/types";
import { queryParam, STATIC_SITE } from "@/lib/site-mode";
import { SendRequestForm } from "./SendRequestForm";

/** The /send page form, with the switch between a design, a color and a size. */
export function SendPageForm({ catalog, initialKind, productId }: { catalog: Catalog; initialKind: RequestKind; productId?: string }) {
  const [kind, setKind] = useState(initialKind);
  const [product, setProduct] = useState(productId);
  useEffect(() => {
    if (!STATIC_SITE) return;
    const type = queryParam("type") as RequestKind | undefined;
    if (type && REQUEST_KINDS.includes(type)) setKind(type);
    setProduct(queryParam("product"));
  }, []);
  return (
    <SendRequestForm
      key={product ?? ""}
      catalog={catalog}
      kind={kind}
      productId={product}
      onKindChange={(k) => {
        setKind(k);
        const url = new URL(window.location.href);
        url.searchParams.set("type", k);
        history.replaceState(null, "", url);
      }}
    />
  );
}
