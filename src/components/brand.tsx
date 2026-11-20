// The school's logo, from public/brand (made from design/brand/bachpan-logo-original.png).
// The mark (flower + child) and the BACHPAN wordmark are separate images so the
// space between them can be set here; their sizes keep the original proportions.

const MARK = { w: 440, h: 375 }; // source pixels
const WORD = { w: 1042, h: 149 };

/** Logo mark only, `width` px wide. Decorative unless `alt` is given. */
export function LogoMark({
  width,
  alt = "",
  className = "",
  imgClassName,
  priority = false,
}: {
  width: number;
  alt?: string;
  className?: string;
  /** Size the image with classes instead (e.g. to shrink it on short screens). */
  imgClassName?: string;
  priority?: boolean;
}) {
  return (
    <picture className={`block shrink-0 ${className}`}>
      <source srcSet="/brand/bachpan-mark.webp" type="image/webp" />
      { }
      <img
        src="/brand/bachpan-mark.png"
        width={width}
        height={Math.round((width * MARK.h) / MARK.w)}
        alt={alt}
        fetchPriority={priority ? "high" : undefined}
        className={`block h-auto ${imgClassName ?? ""}`}
        style={imgClassName ? undefined : { width }}
      />
    </picture>
  );
}

/** Wordmark only, `width` px wide. */
export function LogoWordmark({
  width,
  alt = "",
  className = "",
  imgClassName,
  priority = false,
}: {
  width: number;
  alt?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  return (
    <picture className={`block shrink-0 ${className}`}>
      <source srcSet="/brand/bachpan-wordmark.webp" type="image/webp" />
      { }
      <img
        src="/brand/bachpan-wordmark.png"
        width={width}
        height={Math.round((width * WORD.h) / WORD.w)}
        alt={alt}
        fetchPriority={priority ? "high" : undefined}
        className={`block h-auto ${imgClassName ?? ""}`}
        style={imgClassName ? undefined : { width }}
      />
    </picture>
  );
}

/** Width of the mark that keeps the logo's proportions for a wordmark `wordWidth` px wide. */
export const markWidthFor = (wordWidth: number) => Math.round((wordWidth * MARK.w) / WORD.w);

/** Mark above wordmark with the wider gap; `width` is the wordmark's width. */
export function Logo({ width, gap, label, priority = false }: { width: number; gap: number; label?: string; priority?: boolean }) {
  return (
    <span className="flex flex-col items-center" style={{ gap }} role={label ? "img" : undefined} aria-label={label}>
      <LogoMark width={markWidthFor(width)} priority={priority} />
      <LogoWordmark width={width} priority={priority} />
    </span>
  );
}
