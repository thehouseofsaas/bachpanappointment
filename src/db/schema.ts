// Typed mirror of drizzle/0001_init.sql. The SQL file is the source of truth
// for constraints; this file only gives queries their types.
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const adminUsers = pgTable("admin_users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"owner" | "admin">().notNull().default("admin"),
  active: boolean("active").notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(1),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: ts("locked_until"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const teachers = pgTable("teachers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  active: boolean("active").notNull().default(true),
  linkVersion: integer("link_version").notNull().default(1),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const classSections = pgTable("class_sections", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  className: text("class_name").notNull(),
  section: text("section").notNull().default(""),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color").notNull().default("sky"),
  badge: text("badge").notNull().default("star"),
  teacherId: text("teacher_id"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const classAliases = pgTable("class_aliases", {
  aliasKey: text("alias_key").primaryKey(),
  classSectionId: text("class_section_id").notNull(),
});

export const students = pgTable("students", {
  id: text("id").primaryKey(),
  admissionNo: text("admission_no"),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  classSectionId: text("class_section_id").notNull(),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const studentPhones = pgTable(
  "student_phones",
  {
    studentId: text("student_id").notNull(),
    phone: text("phone").notNull(),
    label: text("label"),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.phone] })],
);

export type MeetingStatus = "draft" | "published" | "cancelled";

export const meetings = pgTable("meetings", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status").$type<MeetingStatus>().notNull().default("draft"),
  meetingDate: date("meeting_date", { mode: "string" }).notNull(),
  bookingOpensAt: ts("booking_opens_at").notNull(),
  bookingClosesAt: ts("booking_closes_at").notNull(),
  paused: boolean("paused").notNull().default(false),
  pausedMessage: text("paused_message"),
  cancelMessage: text("cancel_message"),
  venue: text("venue"),
  parentNote: text("parent_note"),
  defaultStart: time("default_start").notNull(),
  defaultEnd: time("default_end").notNull(),
  slotMinutes: integer("slot_minutes").notNull(),
  gapMinutes: integer("gap_minutes").notNull().default(0),
  breakStart: time("break_start"),
  breakEnd: time("break_end"),
  dateChangedAt: ts("date_changed_at"),
  version: integer("version").notNull().default(1),
  publishedAt: ts("published_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const meetingSessions = pgTable("meeting_sessions", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull(),
  teacherId: text("teacher_id").notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  slotMinutes: integer("slot_minutes").notNull(),
  gapMinutes: integer("gap_minutes").notNull().default(0),
  room: text("room"),
  status: text("status").$type<"active" | "cancelled">().notNull().default("active"),
});

export const sessionSections = pgTable(
  "session_sections",
  {
    sessionId: text("session_id").notNull(),
    meetingId: text("meeting_id").notNull(),
    classSectionId: text("class_section_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.classSectionId] })],
);

export type SlotState = "open" | "blocked" | "cancelled";

export const slots = pgTable("slots", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  meetingId: text("meeting_id").notNull(),
  teacherId: text("teacher_id").notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  state: text("state").$type<SlotState>().notNull().default("open"),
});

export const bookings = pgTable("bookings", {
  id: text("id").primaryKey(),
  refCode: text("ref_code").notNull(),
  slotId: text("slot_id").notNull(),
  meetingId: text("meeting_id").notNull(),
  teacherId: text("teacher_id").notNull(),
  studentId: text("student_id").notNull(),
  status: text("status").$type<"booked" | "cancelled">().notNull().default("booked"),
  cancelledBy: text("cancelled_by").$type<"parent" | "school">(),
  cancelReason: text("cancel_reason"),
  source: text("source").$type<"parent" | "admin">().notNull(),
  bookedPhone: text("booked_phone"),
  lastChangedBy: text("last_changed_by"),
  classLabelSnapshot: text("class_label_snapshot").notNull(),
  attendance: text("attendance").$type<"pending" | "attended" | "no_show">().notNull().default("pending"),
  locked: boolean("locked").notNull().default(false),
  changeCount: integer("change_count").notNull().default(0),
  timeChangedAt: ts("time_changed_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  cancelledAt: ts("cancelled_at"),
});

export const rosterImports = pgTable("roster_imports", {
  id: text("id").primaryKey(),
  adminId: text("admin_id"),
  filename: text("filename").notNull(),
  status: text("status").$type<"staged" | "applied" | "discarded">().notNull().default("staged"),
  staged: jsonb("staged").notNull(),
  summary: jsonb("summary"),
  createdAt: ts("created_at").notNull().defaultNow(),
  appliedAt: ts("applied_at"),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: ts("at").notNull().defaultNow(),
  actorType: text("actor_type").$type<"admin" | "parent" | "teacher" | "system">().notNull(),
  actor: text("actor"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  detail: jsonb("detail"),
  ip: text("ip"),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
