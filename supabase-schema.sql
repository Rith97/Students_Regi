-- Supabase schema for the Student Registration app.
-- Run this in Supabase SQL Editor before connecting the app.

create table if not exists public.students (
  id text primary key,
  student_code text,
  student_name text,
  student_surname text,
  student_given_name text,
  gender text,
  dob text,
  class_name text,
  from_school text,
  pob_village text,
  pob_commune text,
  pob_district text,
  pob_province text,
  contact text,
  father_name text,
  father_occupation text,
  mother_name text,
  mother_occupation text,
  guardian_name text,
  current_village text,
  current_commune text,
  current_district text,
  current_province text,
  photo text,
  created_at text,
  updated_at text
);

alter table public.students
  add column if not exists photo text,
  add column if not exists student_surname text,
  add column if not exists student_given_name text,
  add column if not exists father_occupation text,
  add column if not exists mother_occupation text,
  add column if not exists guardian_name text;

create unique index if not exists students_student_code_unique
  on public.students (student_code)
  where student_code is not null and student_code <> '';

create index if not exists students_class_name_idx on public.students (class_name);
create index if not exists students_student_name_idx on public.students (student_name);

alter table public.students enable row level security;

drop policy if exists "students_public_select" on public.students;
drop policy if exists "students_public_insert" on public.students;
drop policy if exists "students_public_update" on public.students;
drop policy if exists "students_public_delete" on public.students;

create policy "students_public_select"
  on public.students for select
  to anon
  using (true);

create policy "students_public_insert"
  on public.students for insert
  to anon
  with check (true);

create policy "students_public_update"
  on public.students for update
  to anon
  using (true)
  with check (true);

create policy "students_public_delete"
  on public.students for delete
  to anon
  using (true);
