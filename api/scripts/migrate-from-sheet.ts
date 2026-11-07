// One-time move from the Google Sheet / Apps Script backend to Neon.
//
//   SHEET_KEY=<admin access key> node --env-file=<target branch env> \
//     --experimental-strip-types scripts/migrate-from-sheet.ts [--dry-run] [--force]
//
// Reads only from the Sheet (listpage, photos, exportportal). Writes students,
// photos (into the private bucket), settings and the portal tabs into the branch
// named by DATABASE_URL_UNPOOLED / AWS_*. Refuses a non-empty target unless --force.
import pg from "pg";
import { randomUUID } from "node:crypto";
import { HEADERS, emptyStudent, rowToStudent, replaceAllStudents, touchRevision, DATA_REVISION, SETTINGS_REVISION, cell, type Student } from "../src/db.ts";
import { writeAppSettings } from "../src/students.ts";
import { savePhoto, photoObjectKey } from "../src/photos.ts";
import { hashPin } from "../src/portal.ts";

const SHEET_URL = process.env.SHEET_URL || "https://script.google.com/macros/s/AKfycbyc_1v8DBczUTac1CprLsj2Ae5uKt8In-XGpB6lXXmCZj7Mm-4OL1DPSJjNXsD-G2GK/exec";
const SHEET_KEY = String(process.env.SHEET_KEY || "");
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const TARGET = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!SHEET_KEY) throw new Error("SHEET_KEY (the admin access key used by the app) is required");
if (!TARGET) throw new Error("DATABASE_URL_UNPOOLED for the target Neon branch is required");

async function sheet(params: Record<string, string>, attempts = 3): Promise<any> {
  const url = new URL(SHEET_URL);
  Object.entries({ key: SHEET_KEY, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      const payload = await response.json();
      if (payload?.ok !== true) throw new Error(payload?.error || `Sheet returned ${response.status}`);
      return payload;
    } catch (error) {
      if (attempt >= attempts || /Unauthorized|Unknown action/.test(String((error as Error).message))) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }
  }
}

const log = (...args: unknown[]) => console.log(...args);

// ---------- read everything from the Sheet ----------
log("Reading students from the Sheet…");
const first = await sheet({ action: "listpage", offset: "0", limit: "100", includePhotos: "0" });
const total = Number(first.total);
const settings = first.settings || {};
const rows: Student[] = [...first.students];
for (let offset = rows.length; offset < total; offset += 100) {
  const page = await sheet({ action: "listpage", offset: String(offset), limit: "100", includePhotos: "0" });
  rows.push(...page.students);
  process.stdout.write(`  ${rows.length}/${total}\r`);
}
if (rows.length !== total) throw new Error(`Expected ${total} students, read ${rows.length}`);
log(`  ${rows.length} students`);

let portal: any;
try {
  portal = await sheet({ action: "exportportal" });
} catch (error) {
  if (/Unknown action/.test(String((error as Error).message))) {
    throw new Error("The Apps Script does not have the 'exportportal' action yet. Deploy the updated google-sheet-backend.gs as a new version first.");
  }
  throw error;
}
log(`  portal: ${portal.access.length} access rows, ${portal.attendance.length} attendance, ${portal.scores.length} scores, ${portal.activities.length} activities`);

// Stable, unique ids. Rows the Sheet never gave an id keep their position-based one.
const seen = new Set<string>();
const students = rows.map((row, index) => {
  const student = rowToStudent(row as any);
  let id = cell(student.id).trim() || `sheet-row-${index + 2}`;
  if (seen.has(id)) id = `${id}-dup-${index + 2}`;
  seen.add(id);
  student.id = id;
  return student;
});
const renamed = students.filter((student, index) => student.id !== cell(rows[index].id).trim());
if (renamed.length) log(`  note: ${renamed.length} rows had no id or a duplicate id and were given one (${renamed.slice(0, 5).map(s => s.id).join(", ")}…)`);

log("Reading photos…");
const photoById = new Map<string, string>();
const sourceIds = rows.map(row => cell(row.id).trim()).filter(Boolean);
for (let start = 0; start < sourceIds.length; start += 24) {
  const batch = sourceIds.slice(start, start + 24);
  const result = await sheet({ action: "photos", studentIds: batch.join(",") });
  for (const item of result.students) if (item.photo) photoById.set(String(item.id).trim(), item.photo);
  process.stdout.write(`  ${Math.min(start + 24, sourceIds.length)}/${sourceIds.length}\r`);
}
log(`  ${photoById.size} photos readable`);

// ---------- write into Neon ----------
if (DRY_RUN) log("\nDry run only — nothing written.");
else await writeAll();

async function writeAll() {
const client = new pg.Client({ connectionString: TARGET });
await client.connect();
try {
  const existing = (await client.query("select count(*)::int as n from students")).rows[0].n;
  if (existing && !FORCE) throw new Error(`Target already has ${existing} students. Re-run with --force to replace them.`);

  log("Uploading photos to private storage…");
  let uploaded = 0, photoFailures = 0;
  for (const [index, student] of students.entries()) {
    const sourceId = cell(rows[index].id).trim();
    const photo = photoById.get(sourceId) || "";
    if (!photo) { student.photo = ""; continue; }
    try {
      student.photo = await savePhoto(photo, student);
      if (photoObjectKey(student.photo)) uploaded++;
    } catch (error) {
      photoFailures++;
      student.photo = "";
      console.error(`  photo failed for ${student.id}:`, (error as Error).message);
    }
    if (uploaded % 25 === 0) process.stdout.write(`  ${uploaded}\r`);
  }
  log(`  ${uploaded} uploaded, ${photoFailures} failed`);

  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(902001)");
  for (const table of ["students", "app_settings", "portal_access", "portal_sessions", "portal_attendance", "portal_scores", "portal_activities"]) {
    await client.query(`delete from ${table}`);
  }
  await replaceAllStudents(client, students.map(student => {
    const clean = emptyStudent();
    HEADERS.forEach(field => { clean[field] = cell(student[field]); });
    return clean;
  }));
  await writeAppSettings(client, settings);

  for (const row of portal.access) {
    await client.query(`insert into portal_access (scope, class_name, salt, pin_hash, teacher_name, enabled, updated_at)
      values ($1, $2, $3, $4, $5, $6, $7) on conflict (scope, class_name) do nothing`,
      [row.scope, row.className || "", row.salt, row.pinHash, row.teacherName || "", String(row.enabled).toUpperCase() === "TRUE", row.updatedAt || ""]);
  }
  // Without a portal admin code the Sheet accepted its STUDENT_APP_ACCESS_KEY.
  // Carry that same key over (it was just proven valid) so devices keep working.
  const addedAdmin = !portal.access.some((row: any) => row.scope === "admin" && String(row.enabled).toUpperCase() === "TRUE");
  if (addedAdmin) {
    const salt = randomUUID();
    await client.query(`insert into portal_access (scope, class_name, salt, pin_hash, teacher_name, enabled, updated_at)
      values ('admin', '', $1, $2, 'រដ្ឋបាល', true, $3)
      on conflict (scope, class_name) do update set salt = excluded.salt, pin_hash = excluded.pin_hash, enabled = true`,
      [salt, hashPin(salt, SHEET_KEY), new Date().toISOString()]);
    log("  admin code: the current app access key now also unlocks the Neon API and the portal admin login");
  }
  for (const row of portal.attendance) {
    await client.query(`insert into portal_attendance (key, class_name, student_id, date, period, status, reason, updated_at, actor)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (key) do nothing`,
      [row.key, row.className, row.studentId, row.date, row.period, row.status, row.reason || "", row.updatedAt || "", row.actor || ""]);
  }
  for (const row of portal.scores) {
    await client.query(`insert into portal_scores (key, class_name, student_id, subject, assessment, date, max_score, score, notes, updated_at, actor)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) on conflict (key) do nothing`,
      [row.key, row.className, row.studentId, row.subject, row.assessment, row.date, row.maxScore || "", row.score ?? "", row.notes || "", row.updatedAt || "", row.actor || ""]);
  }
  for (const row of portal.activities) {
    await client.query(`insert into portal_activities (id, class_name, date, title, details, updated_at, actor)
      values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing`,
      [row.id || randomUUID(), row.className, row.date, row.title, row.details || "", row.updatedAt || "", row.actor || ""]);
  }
  await touchRevision(client, DATA_REVISION);
  await touchRevision(client, SETTINGS_REVISION);
  await client.query("commit");

  // ---------- verify ----------
  const counts = (await client.query(`select
    (select count(*)::int from students) as students,
    (select count(*)::int from students where photo like 'obj:%') as photos,
    (select count(*)::int from portal_access) as access,
    (select count(*)::int from portal_attendance) as attendance,
    (select count(*)::int from portal_scores) as scores,
    (select count(*)::int from portal_activities) as activities`)).rows[0];
  log("\nWritten:", counts);
  const problems = [
    counts.students !== students.length && `students ${counts.students} ≠ ${students.length}`,
    counts.photos !== uploaded && `photos ${counts.photos} ≠ ${uploaded}`,
    counts.access !== portal.access.length + (addedAdmin ? 1 : 0) && `access rows ${counts.access} ≠ ${portal.access.length + (addedAdmin ? 1 : 0)}`,
    counts.attendance !== portal.attendance.length && `attendance ${counts.attendance} ≠ ${portal.attendance.length}`,
    counts.scores !== portal.scores.length && `scores ${counts.scores} ≠ ${portal.scores.length}`,
    counts.activities !== portal.activities.length && `activities ${counts.activities} ≠ ${portal.activities.length}`
  ].filter(Boolean);
  if (problems.length) throw new Error("Verification failed: " + problems.join("; "));
  log(photoFailures ? `\nMigration finished with ${photoFailures} photo(s) to check.` : "\nMigration finished and verified.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
}
