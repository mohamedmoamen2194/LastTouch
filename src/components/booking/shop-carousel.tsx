"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ThemeTokens } from "@/config/business-types";

type Props = {
  images: string[];
  businessName: string;
  theme: ThemeTokens;
};

/**
 * Fixed-size portrait carousel for the store's shop gallery. Arrows step
 * through the images; dots (when more than one) show position.
 */
export function ShopCarousel({ images, businessName, theme }: Props) {
  const [index, setIndex] = useState(0);
  const count = images.length;
  if (count === 0) return null;

  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const next = () => setIndex((i) => (i + 1) % count);

  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div
        className="relative w-full overflow-hidden rounded-2xl"
        style={{
          aspectRatio: "4 / 5",
          backgroundColor: theme.primaryContainer,
          boxShadow: `0 10px 30px -12px ${theme.primary}`,
        }}
      >
        <img
          src={images[index]}
          alt={`${businessName} photo ${index + 1}`}
          className="h-full w-full object-cover"
        />

        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 sm:px-3">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous photo"
            className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-105"
            style={{ backgroundColor: "rgba(255,255,255,0.9)", color: theme.primary }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next photo"
            className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-105"
            style={{ backgroundColor: "rgba(255,255,255,0.9)", color: theme.primary }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to photo ${i + 1}`}
              className="h-1.5 rounded-full transition-all"
              style={{
                backgroundColor: i === index ? theme.primary : theme.outlineVariant,
                width: i === index ? 18 : 8,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}