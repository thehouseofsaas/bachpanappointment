import { describe, expect, it } from "vitest";
import { bookSlot } from "../../src/domain/booking";
import { parentHome } from "../../src/domain/parent-view";
import { parseTeacherLink, teacherLinkToken, verifyTeacherLink } from "../../src/lib/links";
import { hit } from "../../src/lib/rate-limit";
import { bookingText, csvCell, googleCalendarUrl, icsFile, toCsv, whatsappChatUrl } from "../../src/lib/share";
import { useTestDb } from "../helpers/db";
import { phoneFor, seedMeeting, seedRoster, slotsOf } from "../helpers/fixtures";

const { db, pool } = useTestDb();

describe("teacher links", () => {
  const secret = "s".repeat(40);
  it("verifies its own token and rejects tampering, other teachers and old versions", () => {
    const token = teacherLinkToken(secret, "teach1abc", 3);
    const parsed = parseTeacherLink(token)!;
    expect(parsed.teacherId).toBe("teach1abc");
    expect(verifyTeacherLink(secret, "teach1abc", 3, parsed.signature)).toBe(true);
    expect(verifyTeacherLink(secret, "teach1abc", 4, parsed.signature)).toBe(false); // link was regenerated
    expect(verifyTeacherLink(secret, "teach2abc", 3, parsed.signature)).toBe(false);
    expect(verifyTeacherLink("x".repeat(40), "teach1abc", 3, parsed.signature)).toBe(false);
    expect(parseTeacherLink("teach1abc")).toBeNull();
    expect(parseTeacherLink("../../etc.passwd")).toBeNull();
  });
});

describe("sharing and exports", () => {
  const b = {
    childName: "Aarav",
    classLabel: "Nursery A",
    teacherName: "Ms. Kaur",
    startsAt: new Date("2026-12-12T04:50:00Z"),
    endsAt: new Date("2026-12-12T05:00:00Z"),
    room: "Room 3",
    venue: "Main building",
    refCode: "K7M-4QP",
    schoolName: "Bachpan Play School",
    meetingTitle: "December PTM",
  };
  it("writes the booking in India time", () => {
    const text = bookingText(b, "https://ptm.example");
    expect(text).toContain("Saturday, 12 December 2026, 10:20 am (India time)");
    expect(text).toContain("Booking ref: K7M-4QP");
    expect(whatsappChatUrl("+91 98765 43210", "hi there")).toBe("https://wa.me/919876543210?text=hi%20there");
  });
  it("builds calendar entries in UTC", () => {
    expect(googleCalendarUrl(b)).toContain("dates=20261212T045000Z%2F20261212T050000Z");
    const ics = icsFile(b, "abc", new Date("2026-12-01T00:00:00Z"));
    expect(ics).toContain("DTSTART:20261212T045000Z");
    expect(ics).toContain("LOCATION:Room 3\\, Main building\\, Bachpan Play School");
    expect(ics.endsWith("\r\n")).toBe(true);
  });
  it("defuses spreadsheet formulas and quotes awkward cells", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+919876543210")).toBe("'+919876543210");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("Singh, Aarav")).toBe('"Singh, Aarav"');
    expect(toCsv([["a", 1, null]])).toBe("﻿a,1,\r\n");
  });
});

describe("rate limiting", () => {
  it("allows up to the limit in a window, then refuses", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) results.push(await hit(db, "k", 3, 600));
    expect(results).toEqual([true, true, true, false, false]);
    expect(await hit(db, "other", 3, 600)).toBe(true);
  });
  it("counts concurrent hits exactly", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => hit(db, "burst", 10, 600)));
    expect(results.filter(Boolean)).toHaveLength(10);
  });
});

describe("what a parent sees", () => {
  it("shows only their own children, with sibling hints and remaining changes", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const t1 = await slotsOf(pool, meetingId, "t1");
    // Parent 1 has Child 1 (Nursery A) and Kid One (LKG A).
    await bookSlot(db, { slotId: t1[2], studentId: "s1", actor: { kind: "parent", phone: phoneFor(1) } });
    const home = await parentHome(db, phoneFor(1), 3);
    expect(home.map((c) => c.name).sort()).toEqual(["Child 1", "Kid One"]);
    const child = home.find((c) => c.id === "s1")!;
    expect(child.meetings[0].booking?.slotId).toBe(t1[2]);
    const sibling = home.find((c) => c.id === "k1")!.meetings[0];
    expect(sibling.booking).toBeNull();
    expect(sibling.slots[2].hint).toEqual({ kind: "clash", name: "Child" });
    expect(sibling.slots[3].hint).toEqual({ kind: "after", name: "Child" });
    expect(sibling.slots[1].hint).toEqual({ kind: "before", name: "Child" });
    expect(sibling.slots[5].hint).toBeUndefined();
    expect(sibling.movesLeft).toBe(3);
    // The taken slot is not offered to another family in the same class, and they see no names.
    const other = await parentHome(db, phoneFor(2), 3);
    expect(other).toHaveLength(1);
    expect(other[0].meetings[0].slots.map((s) => s.id)).not.toContain(t1[2]);
    expect(JSON.stringify(other)).not.toContain("Child 1");
    // A number that is not on the roster sees nothing.
    expect(await parentHome(db, "+919999900000", 3)).toEqual([]);
  });

  it("tells the parent when the school cancelled their time", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const mine = await bookSlot(db, { slotId: a, studentId: "s2", actor: { kind: "parent", phone: phoneFor(2) } });
    if (!mine.ok) throw new Error("setup");
    await pool.query(
      "update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'school', cancel_reason = 'The teacher is not available' where id = $1",
      [mine.bookingId],
    );
    const home = await parentHome(db, phoneFor(2), 3);
    expect(home[0].meetings[0].booking).toBeNull();
    expect(home[0].meetings[0].schoolCancelReason).toBe("The teacher is not available");
    expect(home[0].meetings[0].movesLeft).toBe(3); // a school cancellation does not use up the parent's changes
  });
});
