// Shared building blocks for the illustration set. Pure SVG, no hooks.
import type { ReactNode } from "react";

export type ArtProps = { size?: number; className?: string; title?: string };

export const C = {
  navy: "var(--navy, #1f2a52)",
  paper: "var(--paper, #ffffff)",
  wash: "var(--sky-wash, #eaf6ff)",
  coral: "var(--coral, #ff5c6c)",
  coralSoft: "var(--coral-soft, #ffe5e8)",
  tangerine: "var(--tangerine, #ff9838)",
  sunshine: "var(--sunshine, #ffcb2f)",
  sunshineSoft: "var(--sunshine-soft, #fff4cc)",
  leaf: "var(--leaf, #3fbf6b)",
  sky: "var(--sky, #35a7ff)",
  skySoft: "var(--sky-soft, #ddf0ff)",
  grape: "var(--grape, #8a63f2)",
  grapeSoft: "var(--grape-soft, #ebe4ff)",
} as const;

export const RAINBOW = [C.coral, C.tangerine, C.sunshine, C.leaf, C.sky, C.grape] as const;

/** Trims float noise so the markup stays short. */
const num = (v: number) => +v.toFixed(2);

/** Every root <svg> rounds its strokes; children then only state colour and weight. */
export const ROUND = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The shared chunky navy outline. `s` undoes a parent scale so weight stays even. */
export const ink = (s = 1) => ({ stroke: C.navy, strokeWidth: num(2.5 / s) }) as const;
export const O = ink();

/** Decorative unless a title is given. */
export const a11y = (title?: string) =>
  title ? ({ role: "img" } as const) : ({ "aria-hidden": true, focusable: false } as const);

export function Art({
  w,
  h,
  size = w,
  className,
  title,
  children,
}: ArtProps & { w: number; h: number; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={Math.round((size * h) / w)}
      className={className}
      {...ROUND}
      {...a11y(title)}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export type Mood = "smile" | "sleep" | "oh" | "hmm" | "blank";

const MOUTH: Record<Mood, string> = {
  smile: "M-4 5q4 4.5 8 0",
  sleep: "M-3 6q3 3 6 0",
  oh: "M0 5.5a2.4 3 0 1 0 .1 0z",
  hmm: "M-5 8q2.5-3 5 0t5 0",
  blank: "",
};

export function Cheeks({ x1, x2, y, solid }: { x1: number; x2: number; y: number; solid?: boolean }) {
  return (solid ? [C.paper, C.coral] : [C.coral]).map((f) => (
    <g key={f} fill={f} opacity={f === C.coral ? ".45" : undefined}>
      <circle cx={x1} cy={y} r="3" />
      <circle cx={x2} cy={y} r="3" />
    </g>
  ));
}

/** Dot eyes, small mouth, rosy cheeks. (x, y) is the point between the eyes. */
export function Face({
  x,
  y,
  s = 1,
  gap = 9,
  cheek = gap + 5,
  solid,
  mood = "smile",
}: {
  x: number;
  y: number;
  s?: number;
  gap?: number;
  cheek?: number;
  /** White underlay so cheeks stay pink on blue or green. */
  solid?: boolean;
  mood?: Mood;
}) {
  const line = { fill: "none", stroke: C.navy, strokeWidth: 2.2 } as const;
  return (
    <g transform={`translate(${x} ${y})${s === 1 ? "" : ` scale(${s})`}`}>
      {cheek > 0 && <Cheeks x1={-cheek} x2={cheek} y={6} solid={solid} />}
      {mood === "sleep" ? (
        <path d={`M${-gap - 3} 0q3 3 6 0M${gap - 3} 0q3 3 6 0`} {...line} />
      ) : (
        <g fill={C.navy}>
          <circle cx={-gap} r="2.3" />
          <circle cx={gap} r="2.3" />
        </g>
      )}
      {mood !== "blank" && <path d={MOUTH[mood]} {...line} fill={mood === "oh" ? C.navy : "none"} />}
    </g>
  );
}

function starPoints(cx: number, cy: number, R: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI * i) / 5;
    const d = i % 2 ? R * 0.56 : R;
    return `${num(cx + d * Math.sin(a))},${num(cy - d * Math.cos(a))}`;
  }).join(" ");
}

/** Chubby five-point star with rounded tips. R is the tip radius before rounding. */
export function StarShape({
  x,
  y,
  R,
  fill = C.sunshine,
  outline = true,
}: {
  x: number;
  y: number;
  R: number;
  fill?: string;
  outline?: boolean;
}) {
  const p = starPoints(x, y, R);
  const round = num(R * 0.28);
  return (
    <>
      {outline && (
        <polygon points={p} fill={C.navy} stroke={C.navy} strokeWidth={num(round + 5)} />
      )}
      <polygon points={p} fill={fill} stroke={fill} strokeWidth={round} />
    </>
  );
}

/** Puffy cloud, 75.5 x 46 at s=1. (x, y) is the middle of its flat bottom edge. */
export function CloudShape({
  x,
  y,
  s = 1,
  flip,
  mood,
}: {
  x: number;
  y: number;
  s?: number;
  flip?: boolean;
  mood?: Mood;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path
        d="M-22.75 0a14 14 0 0 1-2-27.8a18 18 0 0 1 34-8.2a15 15 0 0 1 22 12a13 13 0 0 1-4 24z"
        fill={C.paper}
        {...ink(s)}
      />
      <path d="M-27-5.5h55" stroke={C.skySoft} strokeWidth="5" />
      {mood && <Face x={-1} y={-21} gap={8} mood={mood} />}
    </g>
  );
}

// One stubby ray per compass point, keyed by angle.
const RAYS: Record<number, string> = {
  0: "M0-21.5v-5.5",
  45: "M15.2-15.2l3.9-3.9",
  90: "M21.5 0h5.5",
  135: "M15.2 15.2l3.9 3.9",
  180: "M0 21.5v5.5",
  225: "M-15.2 15.2l-3.9 3.9",
  270: "M-21.5 0h-5.5",
  315: "M-15.2-15.2l-3.9-3.9",
};
const rays = (skip: number[]) =>
  Object.keys(RAYS)
    .filter((a) => !skip.includes(+a))
    .map((a) => RAYS[+a])
    .join("");

/** Round sun, radius 16 (rays reach 29.5) at s=1. `skip` leaves out rays by angle. */
export function SunShape({
  x,
  y,
  s = 1,
  sleeping,
  skip = [],
}: {
  x: number;
  y: number;
  s?: number;
  sleeping?: boolean;
  skip?: number[];
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={rays(skip)} stroke={C.tangerine} strokeWidth="5" />
      <circle r="16" fill={C.sunshine} {...ink(s)} />
      <Face x={0} y={-2} gap={6} cheek={10} mood={sleeping ? "sleep" : "smile"} />
    </g>
  );
}

/** Two little sleepy "z"s drawn as strokes (no font needed). */
export function Zzz({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 0h6l-6 7h6M10-9h4l-4 5h4"
      fill="none"
      {...O}
      strokeWidth="2"
    />
  );
}
