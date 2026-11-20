import Link from "next/link";
import { HeaderSky, MarkArch } from "@/components/art/header";
import { LogoMark, LogoWordmark } from "@/components/brand";

/**
 * Tall header for parents: sky, the school logo with room to breathe, and a tagline.
 * Sizes are classes so the logo shrinks on a phone held sideways (the `short` variant).
 * Mark and wordmark widths keep the logo's proportions (mark = 0.4223 × wordmark).
 */
export function BrandHeader({ schoolName, tagline, compact = false }: { schoolName: string; tagline: string; compact?: boolean }) {
  const s = compact
    ? { mark: "w-[76px] short:w-[46px]", word: "w-[180px] short:w-[110px]", gap: "gap-3.5 short:gap-2", pad: "pt-5 pb-10 short:pt-2 short:pb-7" }
    : { mark: "w-[110px] short:w-[55px]", word: "w-[260px] short:w-[130px]", gap: "gap-5 short:gap-2.5", pad: "pt-8 pb-12 short:pt-2 short:pb-7" };
  return (
    <header className="safe-top relative overflow-hidden bg-cream">
      <HeaderSky compact={compact} className="absolute inset-0 h-full w-full" />
      <div className={`safe-x relative mx-auto flex max-w-md flex-col items-center ${s.pad}`}>
        <Link href="/" aria-label={`${schoolName} — home`} className={`flex flex-col items-center no-underline ${s.gap}`}>
          <span className="relative block">
            {compact ? null : (
              <MarkArch className="pointer-events-none absolute bottom-[-2px] left-1/2 w-[190%] -translate-x-1/2 short:hidden" />
            )}
            <LogoMark width={compact ? 76 : 110} imgClassName={s.mark} priority className="relative" />
          </span>
          <LogoWordmark width={compact ? 180 : 260} imgClassName={s.word} priority />
        </Link>
        {tagline ? (
          <p
            className={`mt-3 max-w-full truncate rounded-full border-2 border-line bg-paper font-display font-bold text-navy sticker short:mt-1.5 ${
              compact ? "px-3 py-0.5 text-sm" : "px-4 py-1 text-base short:text-sm"
            }`}
          >
            {tagline}
          </p>
        ) : null}
      </div>
    </header>
  );
}
