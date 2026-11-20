import Link from "next/link";
import { HeaderSky, MarkArch } from "@/components/art/header";
import { LogoMark, LogoWordmark, markWidthFor } from "@/components/brand";

/** Tall header for parents: sky, the school logo with room to breathe, and a tagline. */
export function BrandHeader({ schoolName, tagline, compact = false }: { schoolName: string; tagline: string; compact?: boolean }) {
  const word = compact ? 180 : 260;
  const mark = markWidthFor(word);
  return (
    <header className="relative overflow-hidden bg-cream">
      <HeaderSky compact={compact} className="absolute inset-0 h-full w-full" />
      <div className={`relative mx-auto flex max-w-md flex-col items-center px-4 ${compact ? "pt-5 pb-10" : "pt-8 pb-12"}`}>
        <Link
          href="/"
          aria-label={`${schoolName} — home`}
          className={`flex flex-col items-center no-underline ${compact ? "gap-3.5" : "gap-5"}`}
        >
          <span className="relative block">
            {compact ? null : (
              <MarkArch className="pointer-events-none absolute bottom-[-2px] left-1/2 w-[210px] -translate-x-1/2" />
            )}
            <LogoMark width={mark} priority className="relative" />
          </span>
          <LogoWordmark width={word} priority />
        </Link>
        {tagline ? (
          <p
            className={`mt-3 rounded-full border-2 border-line bg-paper font-display font-bold text-navy sticker ${
              compact ? "px-3 py-0.5 text-sm" : "px-4 py-1 text-base"
            }`}
          >
            {tagline}
          </p>
        ) : null}
      </div>
    </header>
  );
}
