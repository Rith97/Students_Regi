// End-to-end check of a deployed API branch. Never point this at production:
// it creates, edits and deletes test students.
// Usage: API_URL=... TEST_ADMIN_KEY=... node scripts/smoke.ts
import assert from "node:assert/strict";

const API = String(process.env.API_URL || process.env.NEON_FUNCTION_STUDENTSAPI_BASE_URL || "").replace(/\/$/, "");
const KEY = String(process.env.TEST_ADMIN_KEY || "");
if (!API || !KEY) throw new Error("API_URL and TEST_ADMIN_KEY are required");
if (process.env.NEON_BRANCH === "main") throw new Error("Refusing to run the smoke test against the main branch");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const run = Date.now().toString(36);

async function get(params: Record<string, string>, key = KEY) {
  const url = new URL(API + "/");
  Object.entries({ key, ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  return (await fetch(url)).json() as Promise<any>;
}
async function post(body: Record<string, unknown>) {
  // Same shape as the app's no-cors POST: text/plain body with accessKey.
  const res = await fetch(API + "/", { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ accessKey: KEY, ...body }) });
  return res.json() as Promise<any>;
}
async function rpc(name: string, ...args: unknown[]) {
  const res = await fetch(API + "/portal/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args }) });
  const payload = await res.json() as any;
  if (!payload.ok) throw new Error(payload.error);
  return payload.result;
}
const step = (name: string) => console.log("✓", name);

// --- access control ---
assert.match((await get({ action: "status" }, "wrong-key")).error, /Unauthorized/);
const status = await get({ action: "status" });
assert.equal(status.ok, true);
assert.equal(status.capabilities.studentLatinName, true);
step("admin key required; status ok");

// --- JSONP, as the app reads ---
const jsonp = await (await fetch(`${API}/?action=status&key=${encodeURIComponent(KEY)}&callback=cb_${run}`)).text();
assert.match(jsonp, new RegExp(`^cb_${run}\\(\\{`));
const injected = await (await fetch(`${API}/?action=status&key=${encodeURIComponent(KEY)}&callback=alert(1)//`)).text();
assert.ok(injected.startsWith("{"), "invalid callback names are ignored");
step("JSONP callback and callback validation");

// --- settings ---
const year = new Date().getFullYear();
assert.equal((await post({ action: "settings", settings: { academicYearStart: year, principalName: "នាយក", classTeachers: { "7A": "គ្រូ ក" } } })).ok, true);
const first = await get({ action: "listpage", offset: "0", limit: "64", includePhotos: "0" });
assert.equal(first.settings.academicYearStart, year);
assert.equal(first.settings.classTeachers["7A"], "គ្រូ ក");
step("settings saved and returned on first page");

// --- upsert with photo, then confirm like the app does ---
const id = `smoke-${run}`;
const student = { id, studentSurname: "សាក", studentGivenName: `ល្បង${run}`, studentLatinName: "SMOKE TEST", gender: "ប្រុស",
  dob: "2012-01-02", className: "7A", photo: PNG, __photoChanged: true, updatedAt: new Date().toISOString() };
assert.equal((await post({ action: "upsert", studentId: id, student })).ok, true);
const checked = await get({ action: "studentstatus", studentId: id });
assert.equal(checked.found, true);
assert.equal(checked.recordId, id);
assert.match(checked.studentCode, new RegExp(`^902${String(year % 100).padStart(2, "0")}07\\d{3}$`));
assert.equal(checked.updatedAt, student.updatedAt);
assert.equal(checked.hasPhoto, true);
assert.equal(checked.photoStorage, "drive");
step(`upsert allocated ${checked.studentCode} and stored the photo privately`);

const photos = await get({ action: "photos", studentIds: id });
assert.equal(photos.students[0].photo, PNG);
step("photo bytes round-trip through private storage");

// Duplicate Khmer name under a different id is rejected, like the Sheet.
await post({ action: "upsert", studentId: `${id}-dup`, student: { ...student, id: `${id}-dup`, photo: "" } });
assert.equal((await get({ action: "studentstatus", studentId: `${id}-dup` })).found, false);
step("duplicate name is not inserted");

// Text-only edit keeps the stored photo.
await post({ action: "upsert", studentId: id, student: { ...student, photo: "", contact: "012345678", updatedAt: new Date().toISOString() } });
const edited = await get({ action: "photos", studentIds: id });
assert.equal(edited.students[0].photo, PNG);
step("text-only edit keeps the photo");

// --- class move reallocates the code ---
const moved = await post({ action: "moveclass", studentId: id, student: { id, className: "8B" } });
assert.equal(moved.changed, true);
assert.match(moved.studentCode, /^902\d{2}08\d{3}$/);
step(`class move to 8B → ${moved.studentCode}`);

// --- listing ---
const identities = await get({ action: "identities" });
assert.ok(identities.students.some((row: any) => row.id === id));
const page = await get({ action: "listpage", offset: "0", limit: "100", includePhotos: "0" });
const row = page.students.find((item: any) => item.id === id);
assert.equal(row.photo, "");
assert.equal(row.studentLatinName, "SMOKE TEST");
assert.equal(row.contact, "012345678");
step("identities and text-only pages");

// --- teacher portal ---
const admin = await rpc("teacherPortalLogin", "__admin__", KEY, false);
assert.equal(admin.role, "admin");
const issued = await rpc("teacherPortalIssueClassPin", admin.token, "8B", "គ្រូ សាកល្បង", "");
assert.match(issued.pin, /^0[1-9]\d{8}$/);
const overview = await rpc("teacherPortalAdminOverview", admin.token);
assert.ok(overview.some((item: any) => item.className === "8B" && item.enabled));
step("admin portal login, class code issued");

const teacher = await rpc("teacherPortalLogin", "8B", issued.pin, true);
assert.equal(teacher.role, "class");
await assert.rejects(rpc("teacherPortalRoster", teacher.token, "7A"), /មិនមានសិទ្ធិ|មិនមានថ្នាក់/);
const roster = await rpc("teacherPortalRoster", teacher.token, "8B");
const mine = roster.students.find((item: any) => item.id === id);
assert.ok(mine);
const portalPhotos = await rpc("teacherPortalPhotos", teacher.token, "8B", [id]);
assert.equal(portalPhotos[0].photo, PNG);
step("teacher sees only own class, with photos");

const today = new Date().toISOString().slice(0, 10);
await rpc("teacherPortalSaveAttendance", teacher.token, "8B", today, "ព្រឹក", [{ studentId: id, status: "អវត្តមាន", reason: "ឈឺ" }]);
const attendance = await rpc("teacherPortalAttendance", teacher.token, "8B", today, "ព្រឹក");
assert.deepEqual(attendance.filter((item: any) => item.studentId === id).map((item: any) => [item.studentId, item.status, item.reason]), [[id, "អវត្តមាន", "ឈឺ"]]);
await rpc("teacherPortalSaveScores", teacher.token, "8B", "គណិត", "ប្រចាំខែ", today, 50, [{ studentId: id, score: 42 }]);
const scores = await rpc("teacherPortalScores", teacher.token, "8B", "គណិត", "ប្រចាំខែ", today);
assert.equal(scores.find((item: any) => item.studentId === id).score, "42");
await assert.rejects(rpc("teacherPortalSaveScores", teacher.token, "8B", "គណិត", "ប្រចាំខែ", today, 50, [{ studentId: id, score: 60 }]), /ពិន្ទុត្រូវនៅចន្លោះ/);
const activity = await rpc("teacherPortalSaveActivity", teacher.token, "8B", { date: today, title: "ប្រជុំ", details: "សាកល្បង" });
assert.ok((await rpc("teacherPortalActivities", teacher.token, "8B")).some((item: any) => item.id === activity.id));
step("attendance, scores (with range check) and activities");

const updated = await rpc("teacherPortalUpdateStudent", teacher.token, "8B", id, { fromSchool: "សាលាសាកល្បង" }, mine.updatedAt);
await assert.rejects(rpc("teacherPortalUpdateStudent", teacher.token, "8B", id, { fromSchool: "x" }, mine.updatedAt), /ផ្លាស់ប្តូរ/);
assert.ok(updated.updatedAt);
step("teacher edit with stale-write protection");

const codes = await rpc("teacherPortalIssueAllClassCodes", admin.token, {});
assert.match(codes.filename, /\.xlsx$/);
assert.equal(Buffer.from(codes.xlsxBase64, "base64").subarray(0, 2).toString(), "PK");
await assert.rejects(rpc("teacherPortalRoster", teacher.token, "8B"), /ផ្លាស់ប្តូរ/);
step("re-issuing codes produces an XLSX and ends old sessions");

await rpc("teacherPortalLogout", admin.token);
await assert.rejects(rpc("teacherPortalAdminOverview", admin.token), /Session/);
step("logout ends the session");

// --- delete ---
const deleted = await post({ action: "delete", studentId: id, student: { id, studentCode: moved.studentCode } });
assert.equal(deleted.deleted, true);
assert.equal((await get({ action: "studentstatus", studentId: id })).found, false);
step("delete confirmed");

console.log("\nAll API checks passed against", API);
