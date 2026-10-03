"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, QrCode, Upload } from "lucide-react";
import jsQR from "jsqr";
import type { ThemeTokens } from "@/config/business-types";

type Detector = { detect: (source: CanvasImageSource, opts?: object) => Promise<{ rawValue: string }[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: object) => Detector;
  }
}

/**
 * In-site QR scanner: live camera with BarcodeDetector when available,
 * otherwise live camera decoded frame-by-frame with jsQR. Photo upload
 * (jsQR) remains as a fallback. Resolves store QR links
 * (booking / check-in) and navigates; foreign links are shown, never
 * auto-opened.
 */
export function ScanView({ theme, slug }: { theme: ThemeTokens; slug: string }) {
  const t = useTranslations("booking");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastJsqrAt = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [found, setFound] = useState<string | null>(null);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setLive(false);
  };

  useEffect(() => stop, []);

  const handleValue = (value: string) => {
    stop();
    try {
      const url = new URL(value, window.location.origin);
      const isOurs =
        url.origin === window.location.origin &&
        (url.pathname.includes(`/book/${slug}`) || url.pathname.includes(`/checkin/${slug}`));
      if (isOurs) {
        router.push(`${url.pathname}${url.search}`);
        return;
      }
      setError(t("scanBadQr"));
      setFound(value);
    } catch {
      setError(t("scanBadQr"));
      setFound(value);
    }
  };

  const tick = async (detector: Detector | null) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => void tick(detector));
      return;
    }
    try {
      if (detector) {
        const codes = await detector.detect(video);
        if (codes.length > 0 && codes[0]?.rawValue) {
          handleValue(codes[0].rawValue);
          return;
        }
      } else {
        // jsQR fallback for browsers without BarcodeDetector (Firefox,
        // Safari, in-app webviews…): decode live frames, throttled.
        const now = Date.now();
        if (now - lastJsqrAt.current > 300 && video.videoWidth > 0) {
          lastJsqrAt.current = now;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const g = canvas.getContext("2d", { willReadFrequently: true });
          if (g) {
            g.drawImage(video, 0, 0, canvas.width, canvas.height);
            const data = g.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(data.data, data.width, data.height);
            if (code?.data) {
              handleValue(code.data);
              return;
            }
          }
        }
      }
    } catch {
      /* keep scanning */
    }
    rafRef.current = requestAnimationFrame(() => void tick(detector));
  };

  const startCamera = async () => {
    setError(null);
    setDenied(false);
    setFound(null);
    if (typeof window === "undefined" || !window.isSecureContext) {
      setError(t("scanNeedsHttps"));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("scanUnsupported"));
      return;
    }
    // BarcodeDetector is a fast path only — its absence must NOT block the
    // camera. Browsers without it fall back to live jsQR decoding.
    let detector: Detector | null = null;
    if (window.BarcodeDetector) {
      try {
        const supported = "getSupportedFormats" in window.BarcodeDetector
          ? await (window.BarcodeDetector as unknown as { getSupportedFormats: () => Promise<string[]> }).getSupportedFormats()
          : ["qr_code"];
        if (supported.includes("qr_code")) {
          detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        }
      } catch {
        detector = null;
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        setError(t("scanError"));
        return;
      }
      // React does NOT set the muted DOM property from the attribute — set it
      // imperatively or mobile browsers reject play() and the camera "fails".
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", stop);
      await video.play();
      setLive(true);
      lastJsqrAt.current = 0;
      rafRef.current = requestAnimationFrame(() => void tick(detector));
    } catch (e) {
      stop();
      // Map the failure so the user knows what to do: a stored block needs
      // a manual allow in the browser UI — retrying alone won't re-prompt.
      if (e instanceof DOMException && (e.name === "NotFoundError" || e.name === "OverconstrainedError")) {
        setError(t("scanNoCamera"));
      } else if (e instanceof DOMException && e.name === "NotAllowedError") {
        setError(t("scanDenied"));
        setDenied(true);
      } else {
        setError(t("scanError"));
      }
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFound(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) throw new Error("canvas");
      g.drawImage(bitmap, 0, 0);
      const data = g.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, data.width, data.height);
      if (code?.data) handleValue(code.data);
      else setError(t("scanBadQr"));
    } catch {
      setError(t("scanBadQr"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div className="text-center">
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.primaryContainer, color: theme.primary }}
        >
          <QrCode className="h-6 w-6" />
        </span>
        <h2 className="mt-3 text-2xl font-bold md:text-3xl" style={{ color: theme.primary }}>
          {t("scanTitle")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: theme.onSurfaceVariant }}>
          {t("scanHint")}
        </p>
      </div>

      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: theme.outlineVariant, backgroundColor: theme.surfaceContainerLowest }}
      >
        <video ref={videoRef} playsInline muted disablePictureInPicture className={`aspect-[4/3] w-full bg-black object-cover ${live ? "" : "hidden"}`} />
        {!live && (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Camera className="h-8 w-8" style={{ color: theme.outlineVariant }} />
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {error && (
        <div className="rounded-xl px-4 py-3 text-center text-sm font-medium" style={{ backgroundColor: "#ba1a1a", color: "#fff" }}>
          {error}
          {denied && (
            <p className="mt-1.5 text-xs font-normal leading-relaxed opacity-90">{t("scanDeniedHint")}</p>
          )}
        </div>
      )}
      {found && (
        <a
          href={found}
          target="_blank"
          rel="noreferrer"
          className="block rounded-full px-6 py-3 text-center text-sm font-semibold"
          style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
        >
          {t("scanOpenLink")}
        </a>
      )}

      <div className="grid grid-cols-2 gap-3">
        {live ? (
          <button
            type="button"
            onClick={stop}
            className="col-span-2 rounded-full px-6 py-3 text-sm font-semibold"
            style={{ border: `2px solid ${theme.primary}`, color: theme.primary }}
          >
            {t("scanStop")}
          </button>
        ) : (
          <button
            type="button"
            onClick={startCamera}
            className="flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
            style={{ backgroundColor: theme.primary, color: theme.onPrimary }}
          >
            <Camera className="h-4 w-4" />
            {t("scanCamera")}
          </button>
        )}
        {!live && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
            style={{ border: `2px solid ${theme.primary}`, color: theme.primary }}
          >
            <Upload className="h-4 w-4" />
            {t("scanUpload")}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </div>
  );
}
