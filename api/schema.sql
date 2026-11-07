-- Student Registration database (Lakebase Postgres on Neon).
-- Values are stored as text, matching the Google Sheet cells the app was built
-- around, so record comparisons (updatedAt, codes, dates) behave the same.
-- Safe to run repeatedly.

create table if not exists students (
  id                  text primary key,
  row_order           integer not null default 0,
  student_code        text not null default '',
  student_name        text not null default '',
  gender              text not null default '',
  dob                 text not null default '',
  class_name          text not null default '',
  from_school         text not null default '',
  pob_village         text not null default '',
  pob_commune         text not null default '',
  pob_district        text not null default '',
  pob_province        text not null default '',
  contact             text not null default '',
  father_name         text not null default '',
  mother_name         text not null default '',
  current_village     text not null default '',
  current_commune     text not null default '',
  current_district    text not null default '',
  current_province    text not null default '',
  photo               text not null default '',
  created_at          text not null default '',
  updated_at          text not null default '',
  student_surname     text not null default '',
  student_given_name  text not null default '',
  father_occupation   text not null default '',
  mother_occupation   text not null default '',
  guardian_name       text not null default '',
  application_number  text not null default '',
  father_phone        text not null default '',
  mother_phone        text not null default '',
  father_dob          text not null default '',
  mother_dob          text not null default '',
  guardian_dob        text not null default '',
  class_track         text not null default '',
  student_latin_name  text not null default ''
);
create index if not exists students_row_order_idx on students (row_order);
create index if not exists students_class_name_idx on students (class_name);
create index if not exists students_student_code_idx on students (student_code);

create table if not exists app_settings (
  key   text primary key,
  value text not null default ''
);

create table if not exists revisions (
  name  text primary key,
  value text not null
);

create table if not exists portal_access (
  scope         text not null,
  class_name    text not null default '',
  salt          text not null,
  pin_hash      text not null,
  teacher_name  text not null default '',
  enabled       boolean not null default true,
  updated_at    text not null default '',
  primary key (scope, class_name)
);

create table if not exists portal_sessions (
  token_hash      text primary key,
  scope           text not null,
  class_name      text not null default '',
  credential_hash text not null,
  persistent      boolean not null default false,
  expires_at      timestamptz not null
);
create index if not exists portal_sessions_expires_idx on portal_sessions (expires_at);

create table if not exists login_failures (
  key        text primary key,
  failures   integer not null default 0,
  expires_at timestamptz not null
);

create table if not exists portal_attendance (
  key         text primary key,
  class_name  text not null,
  student_id  text not null,
  date        text not null,
  period      text not null,
  status      text not null,
  reason      text not null default '',
  updated_at  text not null default '',
  actor       text not null default '',
  row_order   bigserial
);
create index if not exists portal_attendance_lookup_idx on portal_attendance (class_name, date, period);

create table if not exists portal_scores (
  key         text primary key,
  class_name  text not null,
  student_id  text not null,
  subject     text not null,
  assessment  text not null,
  date        text not null,
  max_score   text not null default '',
  score       text not null default '',
  notes       text not null default '',
  updated_at  text not null default '',
  actor       text not null default '',
  row_order   bigserial
);
create index if not exists portal_scores_lookup_idx on portal_scores (class_name, subject, assessment, date);

create table if not exists portal_activities (
  id          text primary key,
  class_name  text not null,
  date        text not null,
  title       text not null,
  details     text not null default '',
  updated_at  text not null default '',
  actor       text not null default '',
  row_order   bigserial
);
create index if not exists portal_activities_class_idx on portal_activities (class_name);
