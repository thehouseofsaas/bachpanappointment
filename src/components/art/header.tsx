// Full-width page art: the hero rainbow and a faint background doodle sheet.
import { C, CloudShape, RAINBOW, ROUND, StarShape, SunShape } from "./base";

type WideProps = { className?: string };

// The sky's wavy lower edge, one 390-wide tile, drawn right to left.
const WAVE = "q-49 12-98 4t-97 0-98 2-97-6";

/**
 * Hero for the top of a phone page, designed on 390x170. The art keeps its
 * size and stays bottom-centred; the sky is drawn far past the viewBox so a
 * wider or taller box fills with more sky instead of zooming in.
 */
export function RainbowHeader({ className }: WideProps) {
  return (
    <svg
      viewBox="0 0 390 170"
      width="100%"
      height="170"
      preserveAspectRatio="xMidYMax meet"
      className={className}
      {...ROUND}
      aria-hidden="true"
      focusable="false"
    >
      <path d={`M-1170-600H1560V152${WAVE.repeat(7)}z`} fill={C.wash} />
      <StarShape x={38} y={44} R={8} outline={false} />
      <StarShape x={68} y={94} R={5} fill={C.coral} outline={false} />
      <StarShape x={318} y={86} R={6} fill={C.grape} outline={false} />
      <SunShape x={350} y={26} s={1.35} />
      <g fill="none" strokeWidth="14" strokeLinecap="butt">
        {RAINBOW.map((c, i) => {
          const r = 121 - i * 13.5;
          return <path key={c} d={`M${195 - r} 152a${r} ${r} 0 0 1 ${2 * r} 0`} stroke={c} />;
        })}
      </g>
      <CloudShape x={106} y={166} s={1.45} mood="smile" />
      <CloudShape x={284} y={166} s={1.45} flip mood="smile" />
    </svg>
  );
}

const DOTS = [
  [120, 36, 0], [262, 130, 3], [96, 150, 4], [186, 300, 1], [300, 330, 5], [24, 330, 2],
  [150, 500, 3], [226, 440, 0], [356, 500, 4], [100, 572, 5], [200, 96, 2],
];

/**
 * Sparse doodles to sit behind content. Already faint (30% opacity); the
 * caller positions it, e.g. absolutely with inset 0.
 */
export function Doodles({ className }: WideProps) {
  return (
    <svg
      viewBox="0 0 390 600"
      width="100%"
      preserveAspectRatio="xMidYMin slice"
      className={className}
      {...ROUND}
      aria-hidden="true"
      focusable="false"
      opacity=".3"
    >
      <StarShape x={44} y={70} R={11} outline={false} />
      <StarShape x={338} y={236} R={8} fill={C.grape} outline={false} />
      <StarShape x={60} y={420} R={9} fill={C.coral} outline={false} />
      <StarShape x={300} y={548} R={12} outline={false} />
      <g transform="translate(330 60)" stroke={C.sky} strokeWidth="2">
        <ellipse rx="15" ry="18" fill={C.sky} />
        <path d="M0 18q-5 8 0 16t-2 14" fill="none" />
      </g>
      <g transform="translate(40 230) rotate(-14)" stroke={C.leaf}>
        <path d="M0-24l17 20L0 22-17-4z" fill={C.leaf} strokeWidth="4" />
        <path d="M0 24q-7 8 0 15t-3 14" fill="none" strokeWidth="2" />
      </g>
      <g transform="translate(336 410)" stroke={C.tangerine} strokeWidth="2">
        <ellipse rx="12" ry="15" fill={C.tangerine} />
        <path d="M0 15q-4 7 0 13t-2 12" fill="none" />
      </g>
      {DOTS.map(([x, y, c]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill={RAINBOW[c]} />
      ))}
    </svg>
  );
}
