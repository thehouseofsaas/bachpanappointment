// Fixed-grid slot generation. Slot n starts at start + n * (slot + gap), so
// times never drift. A break blocks the grid slots it touches.

export type SlotPlanInput = {
  /** Minutes since midnight (India time). */
  startMin: number;
  endMin: number;
  slotMinutes: number;
  gapMinutes: number;
  breakStartMin?: number | null;
  breakEndMin?: number | null;
};

export type PlannedSlot = { startMin: number; endMin: number; blocked: boolean };

export type SlotPlan = {
  slots: PlannedSlot[];
  openCount: number;
  /** End of the last slot; minutes after this are unused remainder. */
  lastEndMin: number | null;
  unusedMinutes: number;
};

export function validateSlotPlanInput(i: SlotPlanInput): string | null {
  if (!Number.isInteger(i.startMin) || !Number.isInteger(i.endMin)) return "Start and end times are required.";
  if (i.startMin < 0 || i.endMin > 24 * 60) return "Times must be within one day.";
  if (i.startMin >= i.endMin) return "End time must be after start time.";
  if (!Number.isInteger(i.slotMinutes) || i.slotMinutes < 5 || i.slotMinutes > 60)
    return "Slot length must be between 5 and 60 minutes.";
  if (!Number.isInteger(i.gapMinutes) || i.gapMinutes < 0 || i.gapMinutes > 30)
    return "Gap must be between 0 and 30 minutes.";
  if (i.endMin - i.startMin < i.slotMinutes) return "The time window is shorter than one slot.";
  const hasBs = i.breakStartMin != null;
  const hasBe = i.breakEndMin != null;
  if (hasBs !== hasBe) return "Give both a break start and a break end, or neither.";
  if (hasBs && hasBe) {
    if (i.breakStartMin! >= i.breakEndMin!) return "Break end must be after break start.";
    if (i.breakStartMin! < i.startMin || i.breakEndMin! > i.endMin) return "The break must be inside the time window.";
  }
  return null;
}

export function planSlots(i: SlotPlanInput): SlotPlan {
  const err = validateSlotPlanInput(i);
  if (err) throw new Error(err);
  const step = i.slotMinutes + i.gapMinutes;
  const slots: PlannedSlot[] = [];
  for (let s = i.startMin; s + i.slotMinutes <= i.endMin; s += step) {
    const e = s + i.slotMinutes;
    const blocked = i.breakStartMin != null && i.breakEndMin != null && s < i.breakEndMin && e > i.breakStartMin;
    slots.push({ startMin: s, endMin: e, blocked });
  }
  const last = slots.at(-1);
  return {
    slots,
    openCount: slots.filter((s) => !s.blocked).length,
    lastEndMin: last ? last.endMin : null,
    unusedMinutes: last ? i.endMin - last.endMin : i.endMin - i.startMin,
  };
}

export type CapacityAdvice = {
  level: "ok" | "tight" | "short";
  children: number;
  openSlots: number;
  /** Suggestions, only when short. */
  extendToMin?: number;
  shorterSlotMinutes?: number;
};

/** Compares open slots with the number of children a session serves. */
export function capacityAdvice(i: SlotPlanInput, children: number): CapacityAdvice {
  const plan = planSlots(i);
  const openSlots = plan.openCount;
  if (children === 0 || openSlots >= Math.ceil(children * 1.1)) return { level: "ok", children, openSlots };
  if (openSlots >= children) return { level: "tight", children, openSlots };

  // How late would the window have to run to fit everyone?
  let extendToMin: number | undefined;
  for (let end = i.endMin + 5; end <= 24 * 60; end += 5) {
    if (planSlots({ ...i, endMin: end }).openCount >= children) {
      extendToMin = end;
      break;
    }
  }
  // Or how short would slots have to be within the current window?
  let shorterSlotMinutes: number | undefined;
  for (let len = i.slotMinutes - 1; len >= 5; len--) {
    if (planSlots({ ...i, slotMinutes: len }).openCount >= children) {
      shorterSlotMinutes = len;
      break;
    }
  }
  return { level: "short", children, openSlots, extendToMin, shorterSlotMinutes };
}
