// Empty / closed / error state illustrations, all on a 160x120 canvas.
import type { ReactNode } from "react";
import { Art, C, CloudShape, Face, O, RAINBOW, StarShape, SunShape, Zzz, type ArtProps } from "./base";

function Scene({ size = 160, className, title, children }: ArtProps & { children: ReactNode }) {
  return (
    <Art w={160} h={120} size={size} className={className} title={title}>
      {children}
    </Art>
  );
}

/** Sun asleep on a cloud: "booking opens later". */
export function SleepingSunArt(p: ArtProps) {
  return (
    <Scene {...p}>
      <StarShape x={22} y={30} R={6} fill={C.grape} outline={false} />
      <StarShape x={142} y={62} R={5} fill={C.sky} outline={false} />
      <SunShape x={80} y={42} s={1.3} sleeping skip={[45, 135, 180, 225]} />
      <Zzz x={108} y={20} s={1.2} />
      <CloudShape x={82} y={114} s={1.25} />
    </Scene>
  );
}

/** Cloud waving goodbye: "booking is closed". */
export function WavingCloudArt(p: ArtProps) {
  return (
    <Scene {...p}>
      <path d="M116 80q16-6 21-26" fill="none" {...O} />
      <g fill={C.paper} {...O}>
        <circle cx="129.5" cy="51" r="4" />
        <circle cx="139" cy="49" r="8.5" />
      </g>
      <path d="M150 38q5 7 4 15M127 35q-5 3-7 9" fill="none" stroke={C.sky} strokeWidth="2.5" />
      <CloudShape x={72} y={108} s={1.5} mood="smile" />
    </Scene>
  );
}

/** Two happy stars having a little party: "all set". */
export function AllBookedArt(p: ArtProps) {
  const dots = [[40, 12], [104, 10], [150, 52], [12, 62], [92, 38], [128, 108]];
  const strips = ["M16 22l3 8", "M70 21l8-3", "M134 18l4 7", "M16 107l6-5"];
  return (
    <Scene {...p}>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill={RAINBOW[i]} />
      ))}
      {strips.map((d, i) => (
        <path key={d} d={d} stroke={RAINBOW[(i * 2 + 3) % 6]} strokeWidth="5" />
      ))}
      <g transform="rotate(-8 56 68)">
        <StarShape x={56} y={68} R={32} />
        <Face x={56} y={66} s={1.25} gap={7} cheek={11} />
      </g>
      <g transform="rotate(10 114 78)">
        <StarShape x={114} y={78} R={22} fill={C.coral} />
        <Face x={114} y={76.5} s={0.9} gap={6.5} cheek={0} />
      </g>
    </Scene>
  );
}

/** Surprised cloud with raindrops: errors / not found. */
export function OopsArt(p: ArtProps) {
  const drop = "M0-9q6.5 8 6.5 12a6.5 6.5 0 0 1-13 0q0-4 6.5-12z";
  return (
    <Scene {...p}>
      <path d="M128 30l7-6M132 42h8M121 20l3-8" fill="none" stroke={C.coral} strokeWidth="3" />
      <CloudShape x={76} y={82} s={1.4} mood="oh" />
      <path d="M63 43q4-3 8-1M81 42q4-2 8 1" fill="none" {...O} strokeWidth="2.2" />
      <g fill={C.sky} {...O}>
        <path d={drop} transform="translate(62 104)" />
        <path d={drop} transform="translate(96 100) scale(.7)" />
      </g>
    </Scene>
  );
}

/** Magnifying glass over a puzzled face: "number not found". */
export function SearchingArt(p: ArtProps) {
  return (
    <Scene {...p}>
      <g transform="translate(5)">
        <path d="M22 28a8 8 0 1 1 11.5 7q-3.5 2-3.5 6" fill="none" stroke={C.grape} strokeWidth="4.5" />
        <circle cx="30" cy="50" r="3" fill={C.grape} />
        <circle cx="78" cy="66" r="36" fill={C.sunshine} {...O} />
        <Face x={78} y={62} s={1.3} gap={11} cheek={17} mood="hmm" />
        <path d="M57 49q6-5 12-2" fill="none" {...O} />
        <path d="M108 72l22 24" stroke={C.navy} strokeWidth="11" />
        <path d="M108 72l22 24" stroke={C.coral} strokeWidth="6" />
        <circle cx="97" cy="59" r="18" fill={C.sky} {...O} />
        <circle cx="97" cy="59" r="12.5" fill={C.paper} {...O} strokeWidth="2" />
        <circle cx="96" cy="60" r="5" fill={C.navy} />
        <circle cx="94.5" cy="58" r="1.6" fill={C.paper} />
      </g>
    </Scene>
  );
}
