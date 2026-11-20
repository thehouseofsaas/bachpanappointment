import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TONES } from "../../src/theme/tones";

// Reads the real token file, so a colour change that breaks contrast fails here.
const css = readFileSync(path.join(import.meta.dirname, "../../src/theme/tokens.css"), "utf8");
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1];
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme contrast (WCAG AA, 4.5:1 for text)", () => {
  it.each(TONES)("%s ink is readable on white, on cream and on its soft tint", (tone) => {
    const ink = token(`${tone}-ink`);
    expect(contrast(ink, token("paper"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, token("cream"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, token(`${tone}-soft`))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TONES)("white text is readable on %s ink (selected buttons, notice icons)", (tone) => {
    expect(contrast("#ffffff", token(`${tone}-ink`))).toBeGreaterThanOrEqual(4.5);
  });

  it("body and muted text are readable on every page background", () => {
    for (const bg of ["paper", "cream", "sky-wash"]) {
      expect(contrast(token("navy"), token(bg)), `navy on ${bg}`).toBeGreaterThanOrEqual(7);
      expect(contrast(token("navy-soft"), token(bg)), `muted on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("navy text is readable on the yellow primary button and on soft tints", () => {
    expect(contrast(token("navy"), token("sunshine"))).toBeGreaterThanOrEqual(4.5);
    for (const tone of TONES) expect(contrast(token("navy"), token(`${tone}-soft`))).toBeGreaterThanOrEqual(7);
  });
});
