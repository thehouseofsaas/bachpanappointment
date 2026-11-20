-- PTM booking: initial schema.
-- Constraints are written by hand because they are the integrity story:
-- the application relies on them, it does not re-implement them.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- admin
create table admin_users (
  id              text primary key,
  name            text not null,
  username        text not null unique,
  password_hash   text not null,
  role            text not null default 'admin' check (role in ('owner', 'admin')),
  active          boolean not null default true,
  session_version integer not null default 1,
  failed_logins   integer not null default 0,
  locked_until    timestamptz,
  created_at      timestamptz not null default now()
);

-- --------------------------------------------------------------- roster
create table teachers (
  id           text primary key,
  name         text not null,
  name_key     text not null unique,
  active       boolean not null default true,
  link_version integer not null default 1,
  created_at   timestamptz not null default now()
);

create table class_sections (
  id         text primary key,
  key        text not null unique,          -- normalized "NURSERY|A"
  class_name text not null,
  section    text not null default '',
  label      text not null,                 -- "Nursery A"
  sort_order integer not null default 0,
  color      text not null default 'sky',   -- theme colour key
  badge      text not null default 'star',  -- badge art key
  teacher_id text references teachers (id),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table class_aliases (
  alias_key        text primary key,
  class_section_id text not null references class_sections (id) on delete cascade
);

create table students (
  id               text primary key,
  admission_no     text,
  name             text not null,
  name_key         text not null,
  class_section_id text not null references class_sections (id),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index students_admission_no_key on students (admission_no) where admission_no is not null;
create index students_section_idx on students (class_section_id) where archived_at is null;

create table student_phones (
  student_id text not null references students (id) on delete cascade,
  phone      text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  label      text,
  primary key (student_id, phone)
);
create index student_phones_phone_idx on student_phones (phone);

-- ------------------------------------------------------------- meetings
create table meetings (
  id                text primary key,
  slug              text not null unique,
  title             text not null,
  status            text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  meeting_date      date not null,
  booking_opens_at  timestamptz not null,
  booking_closes_at timestamptz not null,
  paused            boolean not null default false,
  paused_message    text,
  cancel_message    text,
  venue             text,
  parent_note       text,
  default_start     time not null,
  default_end       time not null,
  slot_minutes      integer not null check (slot_minutes between 5 and 60),
  gap_minutes       integer not null default 0 check (gap_minutes between 0 and 30),
  break_start       time,
  break_end         time,
  date_changed_at   timestamptz,
  version           integer not null default 1,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint meetings_window_check check (booking_opens_at < booking_closes_at),
  constraint meetings_default_window_check check (default_start < default_end)
);

create table meeting_sessions (
  id           text primary key,
  meeting_id   text not null references meetings (id) on delete cascade,
  teacher_id   text not null references teachers (id),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  slot_minutes integer not null check (slot_minutes between 5 and 60),
  gap_minutes  integer not null default 0 check (gap_minutes between 0 and 30),
  room         text,
  status       text not null default 'active' check (status in ('active', 'cancelled')),
  constraint meeting_sessions_one_per_teacher unique (meeting_id, teacher_id),
  constraint meeting_sessions_ref unique (id, meeting_id, teacher_id),
  constraint meeting_sessions_window_check check (starts_at < ends_at)
);

-- Which class sections a session serves. A section belongs to at most one
-- session per meeting, so every child has exactly one place to book.
create table session_sections (
  session_id       text not null references meeting_sessions (id) on delete cascade,
  meeting_id       text not null references meetings (id) on delete cascade,
  class_section_id text not null references class_sections (id),
  primary key (session_id, class_section_id),
  constraint session_sections_one_session_per_meeting unique (meeting_id, class_section_id)
);

create table slots (
  id         text primary key,
  session_id text not null,
  meeting_id text not null,
  teacher_id text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  state      text not null default 'open' check (state in ('open', 'blocked', 'cancelled')),
  constraint slots_session_fk foreign key (session_id, meeting_id, teacher_id)
    references meeting_sessions (id, meeting_id, teacher_id) on update cascade on delete cascade,
  constraint slots_ref unique (id, meeting_id, teacher_id),
  constraint slots_time_check check (ends_at > starts_at),
  -- A teacher can never be in two places at once, across all meetings.
  constraint slots_no_overlap exclude using gist (
    teacher_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (state <> 'cancelled') deferrable initially immediate
);
create index slots_session_idx on slots (session_id, starts_at);

create table bookings (
  id                   text primary key,
  ref_code             text not null unique,
  slot_id              text not null,
  meeting_id           text not null,
  teacher_id           text not null,
  student_id           text not null references students (id),
  status               text not null default 'booked' check (status in ('booked', 'cancelled')),
  cancelled_by         text check (cancelled_by in ('parent', 'school')),
  cancel_reason        text,
  source               text not null check (source in ('parent', 'admin')),
  booked_phone         text,
  last_changed_by      text,              -- phone, or 'school'
  class_label_snapshot text not null,
  attendance           text not null default 'pending' check (attendance in ('pending', 'attended', 'no_show')),
  locked               boolean not null default false,
  change_count         integer not null default 0,
  time_changed_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  cancelled_at         timestamptz,
  constraint bookings_slot_fk foreign key (slot_id, meeting_id, teacher_id)
    references slots (id, meeting_id, teacher_id) on update cascade,
  constraint bookings_cancel_check check ((status = 'cancelled') = (cancelled_at is not null))
);
-- The two load-bearing rules:
create unique index bookings_one_per_slot on bookings (slot_id) where status = 'booked';
create unique index bookings_one_per_child on bookings (meeting_id, teacher_id, student_id) where status = 'booked';
create index bookings_student_idx on bookings (student_id, meeting_id);
create index bookings_meeting_idx on bookings (meeting_id, status);

-- -------------------------------------------------------------- support
create table roster_imports (
  id         text primary key,
  admin_id   text references admin_users (id),
  filename   text not null,
  status     text not null default 'staged' check (status in ('staged', 'applied', 'discarded')),
  staged     jsonb not null,
  summary    jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_type text not null check (actor_type in ('admin', 'parent', 'teacher', 'system')),
  actor      text,
  action     text not null,
  entity     text,
  entity_id  text,
  detail     jsonb,
  ip         text
);
create index audit_log_at_idx on audit_log (at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id);

create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

create table settings (
  key   text primary key,
  value jsonb not null
);
