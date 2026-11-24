"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { Catalog } from "@/lib/catalog/types";
import type { RequestKind } from "@/lib/requests/types";
import { useI18n } from "@/i18n/client";
import { SendRequestForm } from "./SendRequestForm";

/** The "send it to us" form in a pop-up, so people don't lose their place in the designer. */
export function SendDialog({
  kind,
  onClose,
  catalog,
  productId,
  onUseColor,
}: {
  /** Which form to show; null keeps the window closed. */
  kind: RequestKind | null;
  onClose: () => void;
  catalog: Catalog;
  productId?: string;
  onUseColor?: (colorId: string) => void;
}) {
  const { dict } = useI18n();
  const t = dict.send;
  const [shown, setShown] = useState<RequestKind>("design");
  if (kind && kind !== shown) setShown(kind);
  // After something was sent, the next opening starts with an empty form.
  const [round, setRound] = useState(0);
  const sent = useRef(false);
  const close = () => {
    if (sent.current) {
      sent.current = false;
      setRound((r) => r + 1);
    }
    onClose();
  };

  return (
    <Modal open={kind !== null} onClose={close} title={t.titles[shown]} closeLabel={t.close} dismissOnBackdrop={false}>
      <SendRequestForm
        key={`${shown}-${round}`}
        catalog={catalog}
        kind={shown}
        productId={productId}
        onDone={close}
        onSent={() => (sent.current = true)}
        onUseColor={
          onUseColor
            ? (id) => {
                onUseColor(id);
                close();
              }
            : undefined
        }
      />
    </Modal>
  );
}
