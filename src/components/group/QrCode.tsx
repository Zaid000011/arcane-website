"use client";

import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR code for a link, drawn as SVG in brand colors, with a download button. */
export function QrCode({ value, label, downloadLabel, fileName }: { value: string; label: string; downloadLabel: string; fileName: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    void QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#140A0BFF", light: "#F5EBD8FF" } }).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
  }, [value]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* The SVG is generated locally by the QR library from our own link. */}
      <div role="img" aria-label={label} className="w-40 overflow-hidden rounded-lg [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <button type="button" onClick={download} disabled={!svg} className="inline-flex items-center gap-1.5 text-xs text-cream-muted hover:text-gold disabled:opacity-50">
        <Download className="h-3.5 w-3.5" aria-hidden /> {downloadLabel}
      </button>
    </div>
  );
}
