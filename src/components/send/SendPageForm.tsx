"use client";

import { useState } from "react";
import type { Catalog } from "@/lib/catalog/types";
import type { RequestKind } from "@/lib/requests/types";
import { SendRequestForm } from "./SendRequestForm";

/** The /send page form, with the switch between a design, a color and a size. */
export function SendPageForm({ catalog, initialKind, productId }: { catalog: Catalog; initialKind: RequestKind; productId?: string }) {
  const [kind, setKind] = useState(initialKind);
  return (
    <SendRequestForm
      catalog={catalog}
      kind={kind}
      productId={productId}
      onKindChange={(k) => {
        setKind(k);
        const url = new URL(window.location.href);
        url.searchParams.set("type", k);
        history.replaceState(null, "", url);
      }}
    />
  );
}
