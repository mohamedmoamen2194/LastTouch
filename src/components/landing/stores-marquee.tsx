import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scrolling marquee for partner stores. When there are 3 or fewer stores they
 * are laid out statically and centered. Above 3 the children are rendered twice
 * side by side and translated -50% to create a seamless loop.
 */
export function StoresMarquee({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const count = Children.count(children);

  if (count <= 3) {
    return (
      <div className={cn("flex w-full flex-wrap items-center justify-center gap-3", className)}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("group relative w-full overflow-hidden", className)}>
      <div className="flex w-max animate-marquee items-center gap-3 pr-3 group-hover:[animation-play-state:paused]">
        <div className="flex shrink-0 items-center gap-3">{children}</div>
        <div className="flex shrink-0 items-center gap-3" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}