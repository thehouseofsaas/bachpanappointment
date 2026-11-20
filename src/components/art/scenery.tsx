// Small scenery pieces: rainbow, cloud, sun and friends.
import type { Tone } from "@/theme/tones";
import { Art, C, CloudShape, O, RAINBOW, ROUND, StarShape, SunShape, Zzz, a11y, type ArtProps } from "./base";

/** Classic six-band rainbow with rounded feet. */
export function Rainbow({ size = 240, className, title }: ArtProps) {
  return (
    <Art w={240} h={120} size={size} className={className} title={title}>
      <g fill="none" strokeWidth="12">
        {RAINBOW.map((c, i) => {
          const r = 104 - i * 11.5;
          return <path key={c} d={`M${120 - r} 112a${r} ${r} 0 0 1 ${2 * r} 0`} stroke={c} />;
        })}
      </g>
    </Art>
  );
}

export function Cloud({ size = 96, className, title, face }: ArtProps & { face?: boolean }) {
  return (
    <Art w={96} h={60} size={size} className={className} title={title}>
      <CloudShape x={48} y={54} mood={face ? "smile" : undefined} />
    </Art>
  );
}

export function Sun({ size = 64, className, title, sleeping }: ArtProps & { sleeping?: boolean }) {
  return (
    <Art w={64} h={64} size={size} className={className} title={title}>
      <SunShape x={32} y={32} sleeping={sleeping} skip={sleeping ? [45] : []} />
      {sleeping && <Zzz x={45} y={9} s={0.9} />}
    </Art>
  );
}

export function Star({ size = 32, className, title }: ArtProps) {
  return (
    <Art w={48} h={48} size={size} className={className} title={title}>
      <StarShape x={24} y={25.5} R={18} />
    </Art>
  );
}

export function Balloon({ size = 40, className, title, tone = "coral" }: ArtProps & { tone?: Tone }) {
  return (
    <Art w={48} h={72} size={size} className={className} title={title}>
      <path d="M24 49q-5 5 0 11t0 10" fill="none" {...O} strokeWidth="1.8" />
      <path d="M24 44l-4.5 7h9z" fill={C[tone]} {...O} />
      <ellipse cx="24" cy="25" rx="17.5" ry="21" fill={C[tone]} {...O} />
      <path d="M14 20q1.5-7 7-9.5" fill="none" stroke={C.paper} strokeWidth="3" opacity=".7" />
    </Art>
  );
}

export function Kite({ size = 44, className, title }: ArtProps) {
  return (
    <Art w={56} h={84} size={size} className={className} title={title}>
      <path d="M28 56q-9 7 0 13t-3 12" fill="none" {...O} strokeWidth="1.8" />
      <path d="M26 66l-7-3v7zM26 66l7-3v7z" fill={C.grape} {...O} strokeWidth="1.8" />
      <path d="M28 3L5 27h23z" fill={C.coral} />
      <path d="M28 3l23 24H28z" fill={C.sunshine} />
      <path d="M5 27l23 29V27z" fill={C.sky} />
      <path d="M51 27L28 56V27z" fill={C.leaf} />
      <path d="M28 3l23 24-23 29L5 27zM28 3v53M5 27h46" fill="none" {...O} />
    </Art>
  );
}

export function Heart({ size = 32, className, title }: ArtProps) {
  return (
    <Art w={48} h={44} size={size} className={className} title={title}>
      <path
        d="M24 40C8 30 3 20 6 12a10 10 0 0 1 18-2 10 10 0 0 1 18 2c3 8-2 18-18 28z"
        fill={C.coral}
        {...O}
      />
      <path d="M11.5 14q1.5-4 5-4.5" fill="none" stroke={C.paper} strokeWidth="3" opacity=".7" />
    </Art>
  );
}

/** Chunky check mark in a leaf-green circle. */
export function Tick({ size = 32, className, title }: ArtProps) {
  return (
    <Art w={48} h={48} size={size} className={className} title={title}>
      <circle cx="24" cy="24" r="21" fill={C.leaf} {...O} />
      <path d="M14 25l7 7 13-15" fill="none" stroke={C.paper} strokeWidth="6" />
    </Art>
  );
}

/** Full-width rainbow squiggle. Repeats rather than stretches; crops on the right. */
export function WavyDivider({ className, title }: Omit<ArtProps, "size">) {
  return (
    <svg
      viewBox="0 0 1296 12"
      width="100%"
      height="12"
      preserveAspectRatio="xMinYMid slice"
      className={className}
      {...ROUND}
      {...a11y(title)}
    >
      {title ? <title>{title}</title> : null}
      <g fill="none" strokeWidth="3.5">
        {RAINBOW.map((c, i) => (
          <path
            key={c}
            stroke={c}
            d={Array.from({ length: 9 }, (_, k) => `M${k * 144 + i * 24} 6q6-8 12 0t12 0`).join("")}
          />
        ))}
      </g>
    </svg>
  );
}
