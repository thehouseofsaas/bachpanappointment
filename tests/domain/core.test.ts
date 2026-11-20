import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { normalizePhone, splitPhoneCell } from "../../src/domain/phone";
import { capacityAdvice, planSlots, validateSlotPlanInput } from "../../src/domain/slots";
import {
  formatDate,
  formatTime,
  fromLocalInput,
  isValidDate,
  istParts,
  istToInstant,
  parseTime,
  toLocalInput,
} from "../../src/domain/time";

describe("phone normalization", () => {
  const same = [
    "9876512345",
    " 98765 12345 ",
    "98765-12345",
    "+91 98765 12345",
    "+91-9876512345",
    "919876512345",
    "09876512345",
    "0091 98765 12345",
    "(+91) 98765-12345",
    "'9876512345",
    "9876512345.0",
    9876512345,
    9876512345.0,
    "९८७६५१२३४५", // Devanagari digits
    "੯੮੭੬੫੧੨੩੪੫", // Gurmukhi digits
  ];
  it.each(same)("normalizes %s to one number", (input) => {
    expect(normalizePhone(input)).toEqual({ ok: true, phone: "+919876512345" });
  });

  it("rejects numbers that lost digits to scientific notation", () => {
    const r = normalizePhone("9.87651E+09");
    expect(r.ok).toBe(false);
  });

  it("rejects wrong lengths, landlines and junk", () => {
    for (const bad of ["98765", "987651234567", "01762-234567", "2345678901", "abc", "", null, undefined]) {
      expect(normalizePhone(bad).ok, String(bad)).toBe(false);
    }
  });

  it("keeps valid overseas numbers and rejects invalid ones", () => {
    expect(normalizePhone("+1 (416) 555-0123")).toEqual({ ok: true, phone: "+14165550123" });
    expect(normalizePhone("+44 7911 123456")).toEqual({ ok: true, phone: "+447911123456" });
    expect(normalizePhone("+1 23").ok).toBe(false);
  });

  it("warns about placeholder numbers", () => {
    const r = normalizePhone("9999999999");
    expect(r).toMatchObject({ ok: true, warning: expect.any(String) });
  });

  it("splits cells holding several numbers", () => {
    expect(splitPhoneCell("98765 12345 / 9123456780")).toEqual(["98765 12345", "9123456780"]);
    expect(splitPhoneCell("9876512345, 9123456780")).toHaveLength(2);
    expect(splitPhoneCell(9876512345)).toEqual([9876512345]);
    expect(splitPhoneCell("  ")).toEqual([]);
  });

  it("is idempotent", () => {
    fc.assert(
      fc.property(fc.integer({ min: 6_000_000_000, max: 9_999_999_999 }), (n) => {
        const once = normalizePhone(n);
        if (!once.ok) return false;
        const twice = normalizePhone(once.phone);
        return twice.ok && twice.phone === once.phone;
      }),
    );
  });
});

describe("slot grid", () => {
  it("drops the trailing remainder and reports it", () => {
    const plan = planSlots({ startMin: 540, endMin: 600 + 5, slotMinutes: 10, gapMinutes: 0 });
    expect(plan.slots).toHaveLength(6);
    expect(plan.lastEndMin).toBe(600);
    expect(plan.unusedMinutes).toBe(5);
  });

  it("blocks slots that touch the break and keeps the grid", () => {
    const plan = planSlots({
      startMin: 540,
      endMin: 660,
      slotMinutes: 10,
      gapMinutes: 0,
      breakStartMin: 595,
      breakEndMin: 615,
    });
    const blocked = plan.slots.filter((s) => s.blocked).map((s) => s.startMin);
    expect(blocked).toEqual([590, 600, 610]);
    expect(plan.openCount).toBe(9);
  });

  it("validates input", () => {
    const base = { startMin: 540, endMin: 600, slotMinutes: 10, gapMinutes: 0 };
    expect(validateSlotPlanInput(base)).toBeNull();
    expect(validateSlotPlanInput({ ...base, endMin: 540 })).toMatch(/after start/);
    expect(validateSlotPlanInput({ ...base, slotMinutes: 3 })).toMatch(/between 5 and 60/);
    expect(validateSlotPlanInput({ ...base, endMin: 545 })).toMatch(/shorter than one slot/);
    expect(validateSlotPlanInput({ ...base, breakStartMin: 500, breakEndMin: 550 })).toMatch(/inside/);
    expect(validateSlotPlanInput({ ...base, breakStartMin: 550 })).toMatch(/both/);
  });

  it("is always on-grid, ordered, non-overlapping and inside the window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1200 }),
        fc.integer({ min: 5, max: 240 }),
        fc.integer({ min: 5, max: 60 }),
        fc.integer({ min: 0, max: 30 }),
        (start, length, slot, gap) => {
          const input = { startMin: start, endMin: start + length, slotMinutes: slot, gapMinutes: gap };
          if (validateSlotPlanInput(input)) return true;
          const plan = planSlots(input);
          return plan.slots.every((s, i) => {
            const prev = plan.slots[i - 1];
            return (
              (s.startMin - start) % (slot + gap) === 0 &&
              s.endMin - s.startMin === slot &&
              s.startMin >= start &&
              s.endMin <= start + length &&
              (!prev || prev.endMin <= s.startMin)
            );
          });
        },
      ),
    );
  });

  it("advises on capacity", () => {
    const input = { startMin: 540, endMin: 720, slotMinutes: 10, gapMinutes: 0 }; // 18 slots
    expect(capacityAdvice(input, 10).level).toBe("ok");
    expect(capacityAdvice(input, 18).level).toBe("tight");
    const short = capacityAdvice(input, 26);
    expect(short.level).toBe("short");
    expect(short.extendToMin).toBe(800); // 13:20
    expect(short.shorterSlotMinutes).toBe(6);
  });
});

describe("India time", () => {
  it("converts wall-clock time to instants and back", () => {
    const instant = istToInstant("2026-12-12", 9 * 60 + 30);
    expect(instant.toISOString()).toBe("2026-12-12T04:00:00.000Z");
    expect(istParts(instant)).toEqual({ date: "2026-12-12", minutes: 570 });
  });

  it("handles times that fall on the previous UTC day", () => {
    const instant = istToInstant("2026-12-12", 60); // 01:00 IST
    expect(instant.toISOString()).toBe("2026-12-11T19:30:00.000Z");
    expect(istParts(instant).date).toBe("2026-12-12");
  });

  it("rejects impossible dates and times", () => {
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("9:75")).toBeNull();
    expect(parseTime("09:05")).toBe(545);
  });

  it("formats in India time whatever the server timezone", () => {
    const instant = istToInstant("2026-12-12", 10 * 60 + 20);
    expect(formatTime(instant)).toBe("10:20 am");
    expect(formatDate("2026-12-12")).toBe("Saturday, 12 December");
  });

  it("round-trips datetime-local values", () => {
    const instant = fromLocalInput("2026-12-11T20:00")!;
    expect(instant.toISOString()).toBe("2026-12-11T14:30:00.000Z");
    expect(toLocalInput(instant)).toBe("2026-12-11T20:00");
    expect(fromLocalInput("2026-02-31T10:00")).toBeNull();
  });
});
