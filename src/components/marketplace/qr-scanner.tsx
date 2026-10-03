"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Upload } from "lucide-react";

// jsQR loads on demand so it never weighs down the initial bundle.
type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

type Detector = { detect: (source: CanvasImageSource, opts?: object) => Promise<{ rawValue: string }[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: object) => Detector;
  }
}

/**
 * Generic QR scanner: live camera (BarcodeDetector when available,
 * otherwise live jsQR frame decoding) with photo-upload fallback (jsQR).
 * Reports the raw value via onScan — the caller decides
 * what a code means. Camera stops itself after a successful read.
 */
export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const t = useTranslations("booking");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastJsqrAt = useRef(0);
  const jsqrRef = useRef<JsQr | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cbRef = useRef(onScan);
  cbRef.current = onScan;

  const loadJsqr = async (): Promise<JsQr | null> => {
    try {
      if (!jsqrRef.current) jsqrRef.current = (await import("jsqr")).default as JsQr;
      return jsqrRef.current;
    } catch {
      return null;
    }
  };

  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setLive(false);
  };

  useEffect(() => stop, []);

  const handleValue = (value: string) => {
    stop();
    cbRef.current(value);
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
        // jsQR fallback for browsers without BarcodeDetector: decode live
        // frames, throttled to ~3fps to keep phones smooth.
        const now = Date.now();
        if (now - lastJsqrAt.current > 300 && video.videoWidth > 0) {
          lastJsqrAt.current = now;
          const decode = await loadJsqr();
          if (!decode) {
            rafRef.current = requestAnimationFrame(() => void tick(detector));
            return;
          }
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const g = canvas.getContext("2d", { willReadFrequently: true });
          if (g) {
            g.drawImage(video, 0, 0, canvas.width, canvas.height);
            const data = g.getImageData(0, 0, canvas.width, canvas.height);
            const code = decode(data.data, data.width, data.height);
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
        const supported =
          "getSupportedFormats" in window.BarcodeDetector
            ? await (
                window.BarcodeDetector as unknown as {
                  getSupportedFormats: () => Promise<string[]>;
                }
              ).getSupportedFormats()
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
    setDenied(false);
    try {
      const decode = await loadJsqr();
      if (!decode) throw new Error("decoder");
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      if (!g) throw new Error("canvas");
      g.drawImage(bitmap, 0, 0);
      const data = g.getImageData(0, 0, canvas.width, canvas.height);
      const code = decode(data.data, data.width, data.height);
      if (code?.data) handleValue(code.data);
      else setError(t("scanBadQr"));
    } catch {
      setError(t("scanBadQr"));
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="overflow-hidden rounded-2xl border border-[#c5c6cd]/60 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          disablePictureInPicture
          className={`aspect-[4/3] w-full object-cover ${live ? "" : "hidden"}`}
        />
        {!live && (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Camera className="h-8 w-8 text-white/40" />
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      {error && (
        <div className="rounded-xl bg-[#ba1a1a] px-4 py-2.5 text-center text-sm font-medium text-white">
          {error}
          {denied && <p className="mt-1 text-xs font-normal leading-relaxed opacity-90">{t("scanDeniedHint")}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {live ? (
          <button
            type="button"
            onClick={stop}
            className="col-span-2 rounded-full border-2 px-6 py-2.5 text-sm font-semibold"
            style={{ borderColor: "var(--mp-accent, #1e293b)", color: "var(--mp-accent, #1e293b)" }}
          >
            {t("scanStop")}
          </button>
        ) : (
          <button
            type="button"
            onClick={startCamera}
            className="mp-solid flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white"
          >
            <Camera className="h-4 w-4" />
            {t("scanCamera")}
          </button>
        )}
        {!live && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-full border-2 px-6 py-2.5 text-sm font-semibold"
            style={{ borderColor: "var(--mp-accent, #1e293b)", color: "var(--mp-accent, #1e293b)" }}
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
