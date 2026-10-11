import { Instagram } from "lucide-react";

/** LastTouch social + support contact details (single source of truth). */
export const SOCIAL_TIKTOK_URL = "https://www.tiktok.com/@lasttoucheg";
export const SOCIAL_INSTAGRAM_URL = "https://www.instagram.com/lasttoucheg/";
export const SUPPORT_PHONE_DISPLAY = "+201010612370";
export const SUPPORT_PHONE_HREF = "tel:+201010612370";
export const SUPPORT_EMAIL = "Lasttouch.eg@gmail.com";
export const SUPPORT_EMAIL_HREF = "mailto:Lasttouch.eg@gmail.com";

/** TikTok brand mark (lucide has no TikTok icon) — inherits currentColor. */
export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

/**
 * TikTok + Instagram icon buttons linking to the LastTouch social pages.
 * Colors come from the parent (icons use currentColor).
 */
export function SocialLinks({
  className = "",
  linkClassName = "",
  iconClassName = "h-4 w-4",
}: {
  className?: string;
  linkClassName?: string;
  iconClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a
        href={SOCIAL_TIKTOK_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="TikTok"
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-75 ${linkClassName}`}
      >
        <TikTokIcon className={iconClassName} />
      </a>
      <a
        href={SOCIAL_INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram"
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-75 ${linkClassName}`}
      >
        <Instagram className={iconClassName} />
      </a>
    </div>
  );
}
