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

/**
 * Sky behind the logo header. Bottom-centred at natural size; the sky is drawn
 * far past the viewBox (and the svg may overflow) so any width or height of
 * header fills with sky above a wavy bottom edge.
 */
export function HeaderSky({ compact = false, className }: WideProps & { compact?: boolean }) {
  const H = compact ? 188 : 280;
  const edge = H - 20;
  return (
    <svg
      viewBox={`0 0 390 ${H}`}
      preserveAspectRatio="xMidYMax meet"
      className={className}
      style={{ overflow: "visible" }}
      {...ROUND}
      aria-hidden="true"
      focusable="false"
    >
      <path d={`M-1170-900H1560V${edge}${WAVE.repeat(7)}z`} fill={C.wash} />
      {/* Stars and clouds step aside on short screens (phone held sideways), where the logo is small. */}
      <g className="short:hidden">
        <StarShape x={36} y={compact ? 34 : 44} R={compact ? 6 : 8} outline={false} />
        <StarShape x={compact ? 74 : 70} y={compact ? 92 : 128} R={5} fill={C.coral} outline={false} />
        <StarShape x={compact ? 318 : 322} y={compact ? 100 : 136} R={6} fill={C.grape} outline={false} />
        {compact ? null : <StarShape x={92} y={210} R={4} fill={C.leaf} outline={false} />}
        {compact ? null : <StarShape x={300} y={52} R={4} fill={C.sky} outline={false} />}
      </g>
      <SunShape x={compact ? 356 : 350} y={compact ? 30 : 38} s={compact ? 0.95 : 1.3} />
      <g className="short:hidden">
        <CloudShape x={compact ? 40 : 40} y={edge + 2} s={compact ? 0.85 : 1.1} mood="smile" />
        <CloudShape x={compact ? 350 : 352} y={edge - 2} s={compact ? 0.8 : 1} flip mood="smile" />
      </g>
    </svg>
  );
}

/** A thin, light rainbow arch to sit behind the logo mark. Size it with CSS. */
export function MarkArch({ className }: WideProps) {
  return (
    <svg viewBox="0 0 200 104" className={className} aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="5" strokeLinecap="round" opacity="0.55">
        {RAINBOW.map((c, i) => {
          const r = 96 - i * 6;
          return <path key={c} d={`M${100 - r} 102a${r} ${r} 0 0 1 ${2 * r} 0`} stroke={c} />;
        })}
      </g>
    </svg>
  );
}
