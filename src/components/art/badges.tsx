// Class badges: round sticker animals on a transparent 64x64 canvas.
import type { ReactNode } from "react";
import type { Badge } from "@/theme/tones";
import { Art, C, Cheeks, Face, O, StarShape, type ArtProps } from "./base";

function Sticker({ size = 48, className, title, children }: ArtProps & { children: ReactNode }) {
  return (
    <Art w={64} h={64} size={size} className={className} title={title}>
      {children}
    </Art>
  );
}

export function DuckBadge(p: ArtProps) {
  return (
    <Sticker {...p}>
      <path d="M29 15q-5-6 0-11M34 15q0-5 5-7" fill="none" {...O} />
      <circle cx="32" cy="38" r="23" fill={C.sunshine} {...O} />
      <Face x={32} y={33} gap={10} cheek={16} mood="blank" />
      <ellipse cx="32" cy="43.5" rx="9" ry="5.5" fill={C.tangerine} {...O} />
      <path d="M26.5 43.5q5.5 2 11 0" fill="none" {...O} strokeWidth="1.8" />
    </Sticker>
  );
}

export function FrogBadge(p: ArtProps) {
  return (
    <Sticker {...p}>
      <g fill={C.leaf} {...O}>
        <circle cx="20" cy="21" r="10" />
        <circle cx="44" cy="21" r="10" />
      </g>
      <ellipse cx="32" cy="41" rx="26" ry="18.5" fill={C.leaf} {...O} />
      <g fill={C.leaf}>
        <circle cx="20" cy="21" r="8.75" />
        <circle cx="44" cy="21" r="8.75" />
      </g>
      <g fill={C.paper}>
        <circle cx="20" cy="21" r="6" />
        <circle cx="44" cy="21" r="6" />
      </g>
      <g fill={C.navy}>
        <circle cx="21" cy="22" r="3" />
        <circle cx="43" cy="22" r="3" />
      </g>
      <Cheeks x1={12.5} x2={51.5} y={43} solid />
      <path d="M22 44q10 8.5 20 0" fill="none" {...O} strokeWidth="2.2" />
    </Sticker>
  );
}

export function ElephantBadge(p: ArtProps) {
  return (
    <Sticker {...p}>
      <g fill={C.sky} {...O}>
        <circle cx="13.5" cy="28" r="11.5" />
        <circle cx="50.5" cy="28" r="11.5" />
      </g>
      <g fill={C.coralSoft}>
        <circle cx="12.5" cy="28" r="6" />
        <circle cx="51.5" cy="28" r="6" />
      </g>
      <circle cx="32" cy="30" r="18.5" fill={C.sky} {...O} />
      <path d="M27 37v14a5 5 0 0 0 10 0V37" fill={C.sky} {...O} />
      <path d="M30 46.5h4M30 51h4" {...O} strokeWidth="1.6" />
      <Face x={32} y={29} gap={10} cheek={11.5} solid mood="blank" />
    </Sticker>
  );
}

export function ButterflyBadge(p: ArtProps) {
  return (
    <Sticker {...p}>
      <path d="M29 15q-2-7-7-8M35 15q2-7 7-8" fill="none" {...O} />
      <g fill={C.grapeSoft} {...O}>
        <circle cx="21" cy="46" r="10" />
        <circle cx="43" cy="46" r="10" />
      </g>
      <g fill={C.grape} {...O}>
        <circle cx="17" cy="26" r="13.5" />
        <circle cx="47" cy="26" r="13.5" />
      </g>
      <g fill={C.sunshine}>
        <circle cx="14.5" cy="25" r="4.5" />
        <circle cx="49.5" cy="25" r="4.5" />
      </g>
      <ellipse cx="32" cy="42" rx="5.5" ry="14" fill={C.tangerine} {...O} />
      <circle cx="32" cy="24" r="9.5" fill={C.sunshine} {...O} />
      <Face x={32} y={22.5} s={0.8} gap={4.5} cheek={0} />
    </Sticker>
  );
}

export function BunnyBadge(p: ArtProps) {
  return (
    <Sticker {...p}>
      <g fill={C.paper} {...O}>
        <ellipse cx="22" cy="18" rx="7" ry="15" transform="rotate(-10 22 18)" />
        <ellipse cx="42" cy="18" rx="7" ry="15" transform="rotate(10 42 18)" />
      </g>
      <g fill={C.coral}>
        <ellipse cx="22" cy="18" rx="3" ry="10" transform="rotate(-10 22 18)" />
        <ellipse cx="42" cy="18" rx="3" ry="10" transform="rotate(10 42 18)" />
      </g>
      <circle cx="32" cy="42" r="19" fill={C.paper} {...O} />
      <Face x={32} y={39} gap={8.5} cheek={13.5} mood="blank" />
      <ellipse cx="32" cy="44.5" rx="2.7" ry="2" fill={C.coral} />
      <path d="M27.5 48q2.2 2.6 4.5 0q2.3 2.6 4.5 0" fill="none" {...O} strokeWidth="2" />
    </Sticker>
  );
}

export function FishBadge(p: ArtProps) {
  return (
    <Sticker {...p}>
      <g fill={C.sunshine} {...O}>
        <path d="M45 38l13-12q3.5 12 0 24z" />
        <path d="M22 24.5q7-10 16-4l-3 6z" />
      </g>
      <ellipse cx="28" cy="38" rx="22" ry="15.5" fill={C.tangerine} {...O} />
      <path d="M35 30q4 8 0 16M42 32q3 6 0 12" fill="none" stroke={C.sunshine} strokeWidth="2.5" />
      <circle cx="21" cy="42" r="3" fill={C.coral} opacity=".45" />
      <circle cx="16.5" cy="35" r="2.5" fill={C.navy} />
      <path d="M8.5 42q4 3.5 8 .5" fill="none" {...O} strokeWidth="2.2" />
      <g fill={C.skySoft} stroke={C.sky} strokeWidth="2">
        <circle cx="9" cy="15" r="3.5" />
        <circle cx="16.5" cy="7" r="2.3" />
      </g>
    </Sticker>
  );
}

export function BeeBadge(p: ArtProps) {
  const body = { cx: 32, cy: 41, rx: 23, ry: 17 };
  return (
    <Sticker {...p}>
      <g fill={C.skySoft} {...O}>
        <ellipse cx="34" cy="17" rx="8" ry="11.5" transform="rotate(-20 34 17)" />
        <ellipse cx="46" cy="20" rx="7" ry="10" transform="rotate(24 46 20)" />
      </g>
      <path d="M53 37l8 4-8 4z" fill={C.navy} {...O} />
      <path d="M14 30q-3-7-8-7M20 27q-1-8-6-10" fill="none" {...O} />
      <ellipse {...body} fill={C.sunshine} />
      <path d="M39 26.5q3 14.5 0 29M49 32q2 9 0 18" fill="none" stroke={C.navy} strokeWidth="5.5" strokeLinecap="butt" />
      <ellipse {...body} fill="none" {...O} />
      <Face x={22.5} y={39} gap={6} cheek={9} />
    </Sticker>
  );
}

export function StarBadge(p: ArtProps) {
  return (
    <Sticker {...p}>
      <StarShape x={32} y={34} R={24} />
      <Face x={32} y={32.5} gap={6.5} cheek={10} />
    </Sticker>
  );
}

const BADGE_ART: Record<Badge, (p: ArtProps) => ReactNode> = {
  duck: DuckBadge,
  frog: FrogBadge,
  elephant: ElephantBadge,
  butterfly: ButterflyBadge,
  bunny: BunnyBadge,
  fish: FishBadge,
  bee: BeeBadge,
  star: StarBadge,
};

/** Picks the badge art for a class; unknown values fall back to the star. */
export function ClassBadge({ badge, size, className, title }: ArtProps & { badge: Badge }) {
  const Pick = BADGE_ART[badge] ?? StarBadge;
  return <Pick size={size} className={className} title={title} />;
}
