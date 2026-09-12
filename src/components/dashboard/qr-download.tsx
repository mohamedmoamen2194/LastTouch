"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import QRCode from "qrcode";
import type { ThemeTokens } from "@/config/business-types";

/**
 * Renders a QR code for a store link with a download button (print it or show
 * it on a shop device). Generated client-side so the server stays lean.
 */
export function QrDownload({
  value,
  fileName,
  label,
  theme,
}: {
  value: string;
  fileName: string;
  label: string;
  theme: ThemeTokens;
}) {
  const t = useTranslations("settings");
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSrc(null);
    QRCode.toDataURL(value, { width: 320, margin: 2 })
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => {
        if (live) setSrc(null);
      });
    return () => {
      live = false;
    };
  }, [value]);

  return (
    <div
      className="flex flex-1 flex-col items-center gap-2 rounded-xl border p-3"
      style={{ borderColor: theme.outlineVariant }}
    >
      <span className="text-xs font-semibold" style={{ color: theme.onSurfaceVariant }}>
        {label}
      </span>
      {src ? (
        <img src={src} alt={label} className="h-28 w-28 rounded-lg bg-white object-contain" />
      ) : (
        <span
          className="flex h-28 w-28 items-center justify-center rounded-lg text-xs"
          style={{ backgroundColor: theme.surfaceContainerHigh, color: theme.onSurfaceVariant }}
        >
          …
        </span>
      )}
      {src && (
        <a
          href={src}
          download={fileName}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          <Download className="h-3.5 w-3.5" />
          {t("download")}
        </a>
      )}
    </div>
  );
}
