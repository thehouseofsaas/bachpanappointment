import type { AdminPhase } from "@/domain/admin-view";
import type { Tone } from "@/theme/tones";

export const PHASE_TONE: Record<AdminPhase, Tone> = {
  draft: "tangerine",
  not_open: "sky",
  open: "leaf",
  paused: "tangerine",
  closed: "grape",
  cancelled: "coral",
  past: "sky",
};
