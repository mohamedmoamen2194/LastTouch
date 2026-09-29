/**
 * Decorative divider between marketplace sections: hairline — dot — hairline.
 * Purely visual, no text (nothing to translate).
 */
export function SectionSeparator() {
  return (
    <div aria-hidden className="flex items-center gap-3 px-2">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#c5c6cd] to-[#c5c6cd]" />
      <span className="mp-solid h-1.5 w-1.5 rotate-45" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#c5c6cd] to-[#c5c6cd]" />
    </div>
  );
}
