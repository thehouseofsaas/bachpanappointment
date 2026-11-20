import { afterAll, beforeEach } from "vitest";
import { createDb } from "../../src/db/client";

const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54329/ptm";

/** A pool against the test database, emptied before every test. */
export function useTestDb(max = 30) {
  const { db, pool } = createDb(url, max);
  beforeEach(async () => {
    await pool.query(`truncate table
      bookings, slots, session_sections, meeting_sessions, meetings,
      student_phones, students, class_aliases, class_sections, teachers,
      roster_imports, audit_log, rate_limits, settings, admin_users
      restart identity cascade`);
  });
  afterAll(async () => {
    await pool.end();
  });
  return { db, pool, url };
}
