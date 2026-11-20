// Colour and badge choices for classes. Keys match [data-tone] in tokens.css
// and the badge art in components/art/badges.

export const TONES = ["coral", "tangerine", "sunshine", "leaf", "sky", "grape"] as const;
export type Tone = (typeof TONES)[number];

export const TONE_LABELS: Record<Tone, string> = {
  coral: "Red",
  tangerine: "Orange",
  sunshine: "Yellow",
  leaf: "Green",
  sky: "Blue",
  grape: "Purple",
};

export const BADGES = ["duck", "frog", "elephant", "butterfly", "bunny", "fish", "bee", "star"] as const;
export type Badge = (typeof BADGES)[number];

export const BADGE_LABELS: Record<Badge, string> = {
  duck: "Duck",
  frog: "Frog",
  elephant: "Elephant",
  butterfly: "Butterfly",
  bunny: "Bunny",
  fish: "Fish",
  bee: "Bee",
  star: "Star",
};

export function asTone(value: string | null | undefined): Tone {
  return (TONES as readonly string[]).includes(value ?? "") ? (value as Tone) : "sky";
}

export function asBadge(value: string | null | undefined): Badge {
  return (BADGES as readonly string[]).includes(value ?? "") ? (value as Badge) : "star";
}

/** Sensible defaults for a new class: cycles through the rainbow. */
export function defaultLook(index: number): { color: Tone; badge: Badge } {
  const order: Array<[Tone, Badge]> = [
    ["sunshine", "duck"],
    ["leaf", "frog"],
    ["sky", "elephant"],
    ["grape", "butterfly"],
    ["coral", "bunny"],
    ["tangerine", "fish"],
    ["sunshine", "bee"],
    ["sky", "star"],
  ];
  const [color, badge] = order[index % order.length];
  return { color, badge };
}
