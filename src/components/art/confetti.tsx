// One-shot confetti burst. CSS keyframes only; positions are derived from the
// piece index with integer maths, so server and client markup always match.
import type { CSSProperties } from "react";
import { RAINBOW } from "./base";

// No quotes, "<" or "&" in here: React escapes text inside <style>.
const CSS = `
.ptm-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.ptm-confetti i{position:absolute;left:50%;top:42%;width:8px;height:8px;border-radius:2px;opacity:0;animation:ptm-confetti 1.4s cubic-bezier(.15,.8,.3,1) both}
.ptm-confetti i:nth-of-type(7n+2),.ptm-confetti i:nth-of-type(7n+5){border-radius:50%}
.ptm-confetti i:nth-of-type(7n+3),.ptm-confetti i:nth-of-type(7n+6){width:5px;height:12px}
.ptm-confetti i:nth-of-type(4n+2){animation-delay:.07s}
.ptm-confetti i:nth-of-type(4n+3){animation-delay:.13s}
.ptm-confetti i:nth-of-type(4n){animation-delay:.2s}
${RAINBOW.map((c, i) => `.ptm-confetti i:nth-of-type(6n+${i + 1}){background:${c}}`).join("\n")}
@keyframes ptm-confetti{
0%{opacity:0;transform:translate(0,0) scale(.3)}
10%{opacity:1}
42%{opacity:1;transform:translate(var(--x),var(--y)) rotate(var(--r));animation-timing-function:ease-in}
100%{opacity:0;transform:translate(calc(var(--x)*1.25),calc(var(--y) + 220px)) rotate(calc(var(--r)*3))}}
@media (prefers-reduced-motion:reduce){.ptm-confetti{display:none}}
`;

// Integer hash of (piece, salt) into 0..range-1: scattered, yet identical everywhere.
function scatter(i: number, salt: number, range: number) {
  let n = Math.imul(i * 4 + salt, 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
  return ((n ^ (n >>> 15)) >>> 0) % range;
}

/**
 * Place inside a `position: relative` box. Squares, dots and strips burst from
 * the middle and fall once (about 1.6 s), then stay invisible. Hidden entirely
 * for people who prefer reduced motion.
 */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  return (
    <div className="ptm-confetti" aria-hidden="true">
      <style>{CSS}</style>
      {Array.from({ length: pieces }, (_, i) => {
        const style = {
          "--x": `${scatter(i, 1, 281) - 140}px`,
          "--y": `${-20 - scatter(i, 2, 101)}px`,
          "--r": `${scatter(i, 3, 360) - 180}deg`,
        } as CSSProperties;
        return <i key={i} style={style} />;
      })}
    </div>
  );
}
