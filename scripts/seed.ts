// Demo data for local development: one admin, four classes, sample children
// and a published meeting. Never run this against the school's real database.
import { hash } from "@node-rs/argon2";
import nextEnv from "@next/env";
import { createDb } from "../src/db/client";
import { bookSlot } from "../src/domain/booking";
import { createMeeting, publishMeeting } from "../src/domain/meetings";
import { addDays, istDate, istToInstant } from "../src/domain/time";
import { newId } from "../src/lib/ids";
import { saveSettings } from "../src/lib/settings";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL ?? "";
// The demo admin password is public (it is in the README): only ever seed a database on this computer.
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  console.error(`Refusing to seed ${host || "an unknown database"}: demo data is only for a local database.`);
  process.exit(1);
}
const { db, pool } = createDb(url);

const existing = await pool.query("select count(*)::int as n from admin_users");
if (existing.rows[0].n > 0) {
  console.log("Database already has data; not seeding.");
  await pool.end();
  process.exit(0);
}

const adminId = newId();
await pool.query("insert into admin_users (id, name, username, password_hash, role) values ($1, 'School Office', 'office', $2, 'owner')", [
  adminId,
  await hash("ptm-demo-2026"),
]);
await saveSettings(db, { officePhone: "+911762500000" });

const classes: Array<[string, string, string, string, string, string]> = [
  ["Playgroup", "", "sunshine", "duck", "Ms. Simran Kaur", "simran kaur"],
  ["Nursery", "A", "leaf", "frog", "Ms. Neha Sharma", "neha sharma"],
  ["LKG", "A", "sky", "elephant", "Ms. Harpreet Gill", "harpreet gill"],
  ["UKG", "A", "grape", "butterfly", "Ms. Anita Verma", "anita verma"],
];
const first = ["Aarav", "Meher", "Kabir", "Noor", "Vivaan", "Anaya", "Arjun", "Saanvi", "Ishaan", "Kiara", "Reyansh", "Myra", "Gurnoor", "Jasleen", "Advik", "Pari"];
const last = ["Singh", "Kaur", "Sharma", "Gill", "Verma", "Sandhu", "Bansal", "Dhillon"];
const sectionIds: string[] = [];
let n = 0;
for (const [i, [cls, sec, color, badge, teacher, key]] of classes.entries()) {
  const tid = newId();
  const cid = newId();
  sectionIds.push(cid);
  await pool.query("insert into teachers (id, name, name_key) values ($1, $2, $3)", [tid, teacher, key]);
  await pool.query(
    "insert into class_sections (id, key, class_name, section, label, sort_order, color, badge, teacher_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [cid, `${cls.toUpperCase()}|${sec}`, cls, sec, sec ? `${cls} ${sec}` : cls, i * 100, color, badge, tid],
  );
  for (let k = 0; k < 14; k++, n++) {
    const sid = newId();
    const name = `${first[(n * 5 + k) % first.length]} ${last[(n * 3) % last.length]}`;
    await pool.query("insert into students (id, admission_no, name, name_key, class_section_id) values ($1,$2,$3,$4,$5)", [
      sid, `BP${String(1001 + n)}`, name, name.toLowerCase(), cid,
    ]);
    await pool.query("insert into student_phones (student_id, phone, label) values ($1, $2, 'Father')", [sid, `+9198765${String(10000 + n)}`]);
  }
}
// A parent with two children in different classes: 98765 43210.
const sib = await pool.query(`
  select distinct on (class_section_id) id from students
  where class_section_id in ($1, $2) order by class_section_id, name`, [sectionIds[1], sectionIds[2]]);
for (const r of sib.rows) await pool.query("insert into student_phones (student_id, phone, label) values ($1, '+919876543210', 'Mother')", [r.id]);

const date = addDays(istDate(new Date()), 8);
const m = await createMeeting(
  db,
  {
    title: "Monthly Parent-Teacher Meeting",
    date,
    startMin: 9 * 60,
    endMin: 12 * 60 + 30,
    slotMinutes: 10,
    gapMinutes: 0,
    breakStartMin: 11 * 60,
    breakEndMin: 11 * 60 + 20,
    venue: "School building, ground floor",
    parentNote: "Please come 5 minutes early and bring the student diary.",
    bookingOpensAt: new Date(Date.now() - 3600_000),
    bookingClosesAt: istToInstant(addDays(date, -1), 20 * 60),
    sectionIds,
  },
  { adminId },
);
if (!m.ok) throw new Error(m.error);
await publishMeeting(db, m.id, { adminId });

// A few bookings so the screens are not empty.
const kids = await pool.query(`
  select st.id, st.class_section_id from students st
  where not exists (select 1 from student_phones p where p.student_id = st.id and p.phone = '+919876543210')
  order by st.name limit 18`);
for (const [i, k] of kids.rows.entries()) {
  const slot = await pool.query(
    `select s.id from slots s join session_sections ss on ss.session_id = s.session_id
     where ss.class_section_id = $1 and s.meeting_id = $2 and s.state = 'open'
       and not exists (select 1 from bookings b where b.slot_id = s.id and b.status = 'booked')
     order by s.starts_at offset $3 limit 1`,
    [k.class_section_id, m.id, i % 3],
  );
  if (slot.rows[0]) await bookSlot(db, { slotId: slot.rows[0].id, studentId: k.id, actor: { kind: "admin", adminId } });
}

console.log("Seeded. Admin sign-in: office / ptm-demo-2026. Parent demo number: 98765 43210");
await pool.end();
