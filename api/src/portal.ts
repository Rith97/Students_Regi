// Port of teacher-portal.gs. Credentials use the same salted SHA-256 hashes,
// so codes issued by the Apps Script portal keep working after migration.
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { db, withWriteLock, readStudents, touchRevision, rowToStudent, DATA_REVISION, type Queryable } from "./db.ts";
import { readAppSettings, allocateStudentCode, studentCodeAcademicYear } from "./students.ts";
import { photoForClient } from "./photos.ts";

const SESSION_SECONDS = 21600;
const REMEMBER_SECONDS = 30 * 24 * 60 * 60;
const ADMIN_SCOPE = "admin";
const ATTENDANCE_STATUSES = ["អវត្តមាន", "មកយឺត", "សុំច្បាប់", "មានវត្តមាន"];
const EDITABLE_FIELDS = ["studentSurname", "studentGivenName", "studentLatinName", "gender", "dob", "fromSchool", "contact",
  "fatherName", "fatherPhone", "fatherDob", "fatherOccupation", "motherName", "motherPhone", "motherDob",
  "motherOccupation", "guardianName", "guardianDob",
  "pobVillage", "pobCommune", "pobDistrict", "pobProvince",
  "currentVillage", "currentCommune", "currentDistrict", "currentProvince"];
const ROSTER_FIELDS = ["id", "studentCode", "studentName", "studentSurname", "studentGivenName", "studentLatinName", "gender", "dob", "className",
  "fromSchool", "contact", "guardianName", "guardianDob", "fatherName", "fatherPhone", "fatherDob", "fatherOccupation",
  "motherName", "motherPhone", "motherDob", "motherOccupation",
  "pobVillage", "pobCommune", "pobDistrict", "pobProvince", "currentVillage", "currentCommune", "currentDistrict",
  "currentProvince", "updatedAt"];

type AccessRow = { scope: string; className: string; salt: string; pinHash: string; teacherName: string; enabled: boolean; updatedAt: string };
type Session = { scope: string; className: string; actor: string };

export function hashPin(salt: unknown, pin: unknown): string {
  return createHash("sha256").update(String(salt) + ":" + String(pin), "utf8").digest("hex");
}

export function pinMatches(row: AccessRow | null | undefined, pin: unknown): boolean {
  return !!row && row.enabled && !!row.salt && !!row.pinHash && hashPin(row.salt, String(pin || "")) === row.pinHash;
}

export function phoneCode(value: unknown): string {
  const raw = String(value || "").trim().replace(/[០-៩]/g, digit => String("០១២៣៤៥៦៧៨៩".indexOf(digit)));
  if (!raw) return "";
  if (!/^\+?[\d\s().-]+$/.test(raw)) throw new Error("លេខទូរសព្ទត្រូវមានតែលេខ និងសញ្ញាបំបែកធម្មតា");
  let digits = raw.replace(/\D/g, "");
  if (digits.indexOf("855") === 0) digits = "0" + digits.slice(3);
  if (!/^0[1-9]\d{7,8}$/.test(digits)) throw new Error("លេខទូរសព្ទត្រូវមាន ៩ ឬ ១០ ខ្ទង់ (ឧ. 0123456789)");
  return digits;
}

function randomPhoneCode(): string {
  const bytes = randomBytes(9);
  return "0" + String(1 + bytes[0] % 9) + Array.from(bytes.subarray(1, 9), byte => String(byte % 10)).join("");
}

const mapAccess = (row: any): AccessRow => ({ scope: row.scope, className: row.class_name, salt: row.salt, pinHash: row.pin_hash,
  teacherName: row.teacher_name, enabled: row.enabled === true, updatedAt: row.updated_at });

async function accessRows(q: Queryable): Promise<AccessRow[]> {
  return (await q.query("select * from portal_access order by scope, class_name")).rows.map(mapAccess);
}

async function accessRow(q: Queryable, scope: string, className: string): Promise<AccessRow | null> {
  const { rows } = await q.query("select * from portal_access where scope = $1 and class_name = $2", [scope, className]);
  return rows.length ? mapAccess(rows[0]) : null;
}

export async function adminCredential(q: Queryable): Promise<AccessRow | null> {
  const row = await accessRow(q, ADMIN_SCOPE, "");
  return row && row.enabled && row.salt && row.pinHash ? row : null;
}

async function upsertAccess(q: Queryable, row: AccessRow) {
  await q.query(`insert into portal_access (scope, class_name, salt, pin_hash, teacher_name, enabled, updated_at)
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (scope, class_name) do update set salt = excluded.salt, pin_hash = excluded.pin_hash,
      teacher_name = excluded.teacher_name, enabled = excluded.enabled, updated_at = excluded.updated_at`,
    [row.scope, row.className, row.salt, row.pinHash, row.teacherName, row.enabled, row.updatedAt]);
}

export async function portalClasses(q: Queryable = db()) {
  const { rows } = await q.query("select class_name, count(*)::int as n from students where trim(class_name) <> '' group by class_name");
  return rows.map(row => ({ className: String(row.class_name).trim(), count: row.n as number }))
    .sort((a, b) => a.className.localeCompare(b.className, "km-KH", { numeric: true }));
}

// ---------- login throttling (shared with the admin API) ----------
export async function failureCount(key: string): Promise<number> {
  const { rows } = await db().query("select failures from login_failures where key = $1 and expires_at > now()", [key]);
  return rows.length ? rows[0].failures : 0;
}
export async function recordFailure(key: string): Promise<void> {
  await db().query(`insert into login_failures (key, failures, expires_at) values ($1, 1, now() + interval '15 minutes')
    on conflict (key) do update set failures = case when login_failures.expires_at > now() then login_failures.failures + 1 else 1 end,
      expires_at = now() + interval '15 minutes'`, [key]);
}
export async function clearFailures(key: string): Promise<void> {
  await db().query("delete from login_failures where key = $1", [key]);
}

// ---------- sessions ----------
const tokenHash = (token: string) => hashPin("session", token);
const TOKEN_FORMAT = /^[0-9a-f-]{72}$/;

async function login(className: unknown, pin: unknown, remember: unknown) {
  const cls = String(className || "").trim();
  const supplied = String(pin || "").trim();
  if (!supplied || supplied.length > 80) throw new Error("សូមបញ្ចូលលេខកូដ");
  const scope = cls === "__admin__" ? ADMIN_SCOPE : "class";
  if (scope === "class" && !(await portalClasses()).some(item => item.className === cls)) throw new Error("មិនមានថ្នាក់នេះទេ");
  const throttleKey = "portal:" + hashPin("scope", scope + ":" + cls).slice(0, 35);
  if (await failureCount(throttleKey) >= 20) throw new Error("សាកលេខកូដច្រើនដងពេក។ សូមរង់ចាំ ១៥ នាទី");
  const credential = await accessRow(db(), scope, scope === ADMIN_SCOPE ? "" : cls);
  let normalized = supplied;
  if (scope === "class" && /^[+\d\s().-]+$/.test(supplied) && /^\+?855|^0/.test(supplied)) {
    try { normalized = phoneCode(supplied); } catch { normalized = supplied; }
  }
  if (!pinMatches(credential, normalized)) {
    await recordFailure(throttleKey);
    throw new Error("លេខកូដមិនត្រឹមត្រូវ ឬថ្នាក់មិនទាន់បើកប្រើ");
  }
  await clearFailures(throttleKey);
  const token = randomUUID() + randomUUID();
  const persistent = remember === true && scope === "class";
  const seconds = persistent ? REMEMBER_SECONDS : SESSION_SECONDS;
  await db().query(`insert into portal_sessions (token_hash, scope, class_name, credential_hash, persistent, expires_at)
    values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))`,
    [tokenHash(token), scope, cls, credential!.pinHash, persistent, seconds]);
  await db().query("delete from portal_sessions where expires_at < now()");
  return { token, role: scope, className: scope === ADMIN_SCOPE ? "" : cls, teacherName: credential!.teacherName || "",
    remembered: persistent, expiresIn: seconds };
}

async function session(token: unknown, adminOnly: boolean): Promise<Session> {
  const key = String(token || "").trim();
  if (!TOKEN_FORMAT.test(key)) throw new Error("សូមចូលប្រើ Portal ម្តងទៀត");
  const { rows } = await db().query("select scope, class_name, credential_hash from portal_sessions where token_hash = $1 and expires_at > now()", [tokenHash(key)]);
  if (!rows.length) throw new Error("Session ផុតកំណត់។ សូមចូលប្រើម្តងទៀត");
  const stored = rows[0];
  const credential = await accessRow(db(), stored.scope, stored.scope === ADMIN_SCOPE ? "" : stored.class_name);
  if (!credential || !credential.enabled || credential.pinHash !== stored.credential_hash) {
    throw new Error("សិទ្ធិចូលប្រើត្រូវបានផ្លាស់ប្តូរ។ សូមចូលម្ដងទៀត");
  }
  if (adminOnly && stored.scope !== ADMIN_SCOPE) throw new Error("ត្រូវការសិទ្ធិរដ្ឋបាល");
  return { scope: stored.scope, className: stored.class_name,
    actor: credential.teacherName || (stored.scope === ADMIN_SCOPE ? "រដ្ឋបាល" : "គ្រូថ្នាក់ " + stored.class_name) };
}

async function logout(token: unknown) {
  const key = String(token || "").trim();
  if (!TOKEN_FORMAT.test(key)) return false;
  await db().query("delete from portal_sessions where token_hash = $1", [tokenHash(key)]);
  return true;
}

async function assertClass(current: { scope: string; className?: string }, className: unknown, q: Queryable = db()): Promise<string> {
  const wanted = String(className || current.className || "").trim();
  if (!(await portalClasses(q)).some(item => item.className === wanted)) throw new Error("មិនមានថ្នាក់នេះទេ");
  if (current.scope !== ADMIN_SCOPE && current.className !== wanted) throw new Error("មិនមានសិទ្ធិលើថ្នាក់នេះ");
  return wanted;
}

// ---------- admin ----------
async function adminOverview(token: unknown) {
  await session(token, true);
  const access = await accessRows(db());
  const teachers = (await readAppSettings(db())).classTeachers || {};
  return (await portalClasses()).map(item => {
    const row = access.find(entry => entry.scope === "class" && entry.className === item.className);
    return { className: item.className, count: item.count, teacherName: (row && row.teacherName) || String(teachers[item.className] || ""), enabled: !!row && row.enabled };
  });
}

async function issueClassPin(token: unknown, className: unknown, teacherName: unknown, phoneNumber: unknown) {
  await session(token, true);
  return withWriteLock(async q => {
    const cls = await assertClass({ scope: ADMIN_SCOPE }, className, q);
    const pin = phoneCode(phoneNumber) || randomPhoneCode();
    if ((await accessRows(q)).some(row => row.scope === "class" && row.className !== cls && pinMatches(row, pin))) {
      throw new Error("លេខនេះត្រូវបានប្រើសម្រាប់ថ្នាក់ផ្សេងរួចហើយ");
    }
    const salt = randomUUID();
    const name = String(teacherName || "").trim().slice(0, 100);
    await upsertAccess(q, { scope: "class", className: cls, salt, pinHash: hashPin(salt, pin), teacherName: name, enabled: true, updatedAt: new Date().toISOString() });
    return { className: cls, teacherName: name, pin };
  });
}

async function issueAllClassCodes(token: unknown, assignments: unknown) {
  await session(token, true);
  const provided = assignments && typeof assignments === "object" && !Array.isArray(assignments) ? assignments as Record<string, any> : {};
  return withWriteLock(async q => {
    const classes = await portalClasses(q);
    if (!classes.length) throw new Error("មិនមានថ្នាក់សម្រាប់បង្កើតលេខកូដ");
    if (classes.length > 300) throw new Error("ថ្នាក់ច្រើនពេកសម្រាប់បង្កើតម្តង");
    const known = new Set(classes.map(item => item.className));
    Object.keys(provided).forEach(cls => { if (!known.has(cls)) throw new Error("មិនមានថ្នាក់ " + cls); });
    const access = await accessRows(q);
    const teacherSettings = (await readAppSettings(q)).classTeachers || {};
    const now = new Date().toISOString();
    const used = new Set<string>();
    const issued = classes.map(item => {
      const input = provided[item.className] || {};
      const prior = access.find(row => row.scope === "class" && row.className === item.className);
      const teacherName = String(input.teacherName || (prior && prior.teacherName) || teacherSettings[item.className] || "").trim().slice(0, 100);
      let code = phoneCode(input.phoneNumber);
      if (!code) {
        let tries = 0;
        do { code = randomPhoneCode(); tries++; } while (used.has(code) && tries < 20);
      }
      if (used.has(code)) throw new Error("លេខទូរសព្ទ/លេខកូដជាន់គ្នាសម្រាប់ថ្នាក់ " + item.className);
      used.add(code);
      const salt = randomUUID();
      return { className: item.className, teacherName, code, row: { scope: "class", className: item.className, salt, pinHash: hashPin(salt, code), teacherName, enabled: true, updatedAt: now } };
    });
    // Build the file before changing credentials, so an export failure does not rotate logins.
    const xlsxBase64 = codesXlsx(issued);
    for (const item of issued) await upsertAccess(q, item.row);
    return { filename: "teacher-portal-codes-" + now.slice(0, 10) + ".xlsx", xlsxBase64,
      codes: issued.map(item => ({ className: item.className, teacherName: item.teacherName, code: item.code })) };
  });
}

export function codesXlsx(items: { className: string; teacherName: string; code: string }[]): string {
  const escape = (value: unknown) => String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const cell = (ref: string, value: unknown, style: number) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
  const rows = [`<row r="1" ht="30" customHeight="1">${cell("A1", "លេខកូដចូល Teacher Portal", 1)}</row>`,
    `<row r="2">${cell("A2", "ឯកសារសម្ងាត់ — ផ្ដល់លេខកូដទៅគ្រូតាមថ្នាក់ប៉ុណ្ណោះ", 2)}</row>`,
    `<row r="4" ht="26" customHeight="1">${cell("A4", "ថ្នាក់", 3)}${cell("B4", "ឈ្មោះគ្រូបន្ទុកថ្នាក់", 3)}${cell("C4", "លេខកូដ", 3)}</row>`];
  items.forEach((item, index) => {
    const n = index + 5;
    rows.push(`<row r="${n}" ht="23" customHeight="1">${cell("A" + n, item.className, 0)}${cell("B" + n, item.teacherName, 0)}${cell("C" + n, item.code, 4)}</row>`);
  });
  const last = items.length + 4;
  const files: Record<string, string> = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Teacher Codes" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="15"/><color rgb="FF17365D"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F6FB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A4:C${last}"/></worksheet>`
  };
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([path, xml]) => [path, strToU8(xml)])));
  return Buffer.from(zipped).toString("base64");
}

async function disableClassPin(token: unknown, className: unknown) {
  await session(token, true);
  return withWriteLock(async q => {
    const cls = await assertClass({ scope: ADMIN_SCOPE }, className, q);
    await q.query("update portal_access set enabled = false, updated_at = $2 where scope = 'class' and class_name = $1", [cls, new Date().toISOString()]);
    return { className: cls, enabled: false };
  });
}

// ---------- roster ----------
async function roster(q: Queryable, className: string) {
  const students = (await readStudents(q, { includePhotos: false }))
    .filter(student => String(student.className || "").trim() === className && String(student.id || "").trim());
  return students.map(student => Object.fromEntries(ROSTER_FIELDS.map(key => [key, (student as any)[key] || ""])));
}

async function assignMissingCodes(token: unknown, className: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  return withWriteLock(async q => {
    const { rows } = await q.query("select id, student_code, class_name from students order by row_order, id");
    const academicYear = await studentCodeAcademicYear(q);
    const used = new Set<string>(rows.map(row => String(row.student_code || "").trim()).filter(Boolean));
    let assigned = 0;
    for (const row of rows) {
      if (String(row.class_name || "").trim() !== cls || String(row.student_code || "").trim()) continue;
      const code = allocateStudentCode(cls, "", [...used], academicYear);
      used.add(code);
      await q.query("update students set student_code = $2, updated_at = $3 where id = $1", [row.id, code, new Date().toISOString()]);
      assigned++;
    }
    if (assigned) await touchRevision(q, DATA_REVISION);
    return { className: cls, assigned };
  });
}

async function rosterFor(token: unknown, className: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  return { className: cls, teacherName: current.actor, students: await roster(db(), cls) };
}

async function photos(token: unknown, className: unknown, studentIds: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  if (!Array.isArray(studentIds) || !studentIds.length || studentIds.length > 4) throw new Error("សូមស្នើរូបថតពី ១ ដល់ ៤ នាក់ក្នុងមួយដង");
  const requested = studentIds.map(id => String(id || "").trim());
  if (requested.some(id => !id) || new Set(requested).size !== requested.length) throw new Error("អត្តសញ្ញាណរូបថតមិនត្រឹមត្រូវ");
  const { rows } = await db().query("select id, class_name, photo from students where id = any($1)", [requested]);
  const byId = new Map(rows.map(row => [String(row.id).trim(), row]));
  const found = requested.map(id => {
    const row = byId.get(id);
    if (!row) throw new Error("រកមិនឃើញសិស្សសម្រាប់រូបថត");
    if (String(row.class_name || "").trim() !== cls) throw new Error("មិនមានសិទ្ធិមើលរូបថតថ្នាក់ផ្សេង");
    return row;
  });
  return Promise.all(found.map(async row => ({ id: String(row.id).trim(), photo: await photoForClient(row.photo) })));
}

// ---------- attendance, scores, activities ----------
function portalDate(value: unknown): string {
  const date = String(value || "").trim();
  const parsed = new Date(date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("កាលបរិច្ឆេទមិនត្រឹមត្រូវ");
  return date;
}

function portalPeriod(value: unknown): string {
  const period = String(value || "").trim();
  if (!["ព្រឹក", "រសៀល", "ពេញថ្ងៃ"].includes(period)) throw new Error("សូមជ្រើសរើសវេនត្រឹមត្រូវ");
  return period;
}

async function attendance(token: unknown, className: unknown, date: unknown, period: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  const { rows } = await db().query("select student_id, status, reason, updated_at from portal_attendance where class_name = $1 and date = $2 and period = $3 order by row_order",
    [cls, portalDate(date), portalPeriod(period)]);
  return rows.map(row => ({ studentId: row.student_id, status: row.status, reason: row.reason, updatedAt: row.updated_at }));
}

async function saveAttendance(token: unknown, className: unknown, date: unknown, period: unknown, entries: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  const day = portalDate(date);
  const shift = portalPeriod(period);
  if (!Array.isArray(entries) || entries.length > 250) throw new Error("ចំនួនកំណត់ត្រាអវត្តមានមិនត្រឹមត្រូវ");
  return withWriteLock(async q => {
    const allowed = new Set((await roster(q, cls)).map(student => String(student.id)));
    const { rows } = await q.query("select key from portal_attendance where class_name = $1 and date = $2 and period = $3", [cls, day, shift]);
    const existing = new Set(rows.map(row => row.key));
    const seen = new Set<string>();
    const now = new Date().toISOString();
    for (const item of entries as any[]) {
      const id = String(item.studentId || "").trim();
      const status = String(item.status || "").trim();
      if (!allowed.has(id)) throw new Error("សិស្សមិនស្ថិតក្នុងថ្នាក់នេះ");
      if (!ATTENDANCE_STATUSES.includes(status)) throw new Error("ស្ថានភាពវត្តមានមិនត្រឹមត្រូវ");
      const key = [cls, day, shift, id].join("|");
      if (seen.has(key)) throw new Error("សិស្សត្រូវបានបញ្ចូលពីរដង");
      seen.add(key);
      if (status === "មានវត្តមាន" && !existing.has(key)) continue;
      await q.query(`insert into portal_attendance (key, class_name, student_id, date, period, status, reason, updated_at, actor)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (key) do update set status = excluded.status, reason = excluded.reason, updated_at = excluded.updated_at, actor = excluded.actor`,
        [key, cls, id, day, shift, status, String(item.reason || "").trim().slice(0, 500), now, current.actor]);
    }
    return { saved: seen.size, className: cls, date: day, period: shift };
  });
}

async function scores(token: unknown, className: unknown, subject: unknown, assessment: unknown, date: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  const course = String(subject || "").trim();
  const exam = String(assessment || "").trim();
  const day = portalDate(date);
  if (!course || !exam) return [];
  const { rows } = await db().query(`select student_id, score, max_score, notes, updated_at from portal_scores
    where class_name = $1 and subject = $2 and assessment = $3 and date = $4 order by row_order`, [cls, course, exam, day]);
  return rows.map(row => ({ studentId: row.student_id, score: row.score, maxScore: row.max_score, notes: row.notes, updatedAt: row.updated_at }));
}

async function saveScores(token: unknown, className: unknown, subject: unknown, assessment: unknown, date: unknown, maxScore: unknown, entries: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  const course = String(subject || "").trim().slice(0, 100);
  const exam = String(assessment || "").trim().slice(0, 100);
  const day = portalDate(date);
  const maximum = Number(maxScore);
  if (!course || !exam) throw new Error("សូមបញ្ចូលមុខវិជ្ជា និងប្រភេទពិន្ទុ");
  if (!Number.isFinite(maximum) || maximum <= 0 || maximum > 1000) throw new Error("ពិន្ទុពេញត្រូវមានពី ១ ដល់ ១០០០");
  if (!Array.isArray(entries) || entries.length > 250) throw new Error("ចំនួនពិន្ទុមិនត្រឹមត្រូវ");
  return withWriteLock(async q => {
    const allowed = new Set((await roster(q, cls)).map(student => String(student.id)));
    const { rows } = await q.query("select key from portal_scores where class_name = $1 and subject = $2 and assessment = $3 and date = $4", [cls, course, exam, day]);
    const existing = new Set(rows.map(row => row.key));
    const seen = new Set<string>();
    const now = new Date().toISOString();
    for (const item of entries as any[]) {
      const id = String(item.studentId || "").trim();
      if (!allowed.has(id)) throw new Error("សិស្សមិនស្ថិតក្នុងថ្នាក់នេះ");
      const raw = String(item.score === undefined || item.score === null ? "" : item.score).trim();
      const score = raw === "" ? "" : Number(raw);
      if (score !== "" && (!Number.isFinite(score) || score < 0 || score > maximum)) throw new Error("ពិន្ទុត្រូវនៅចន្លោះ ០ និង " + maximum);
      const key = [cls, id, course, exam, day].join("|");
      if (seen.has(key)) throw new Error("ពិន្ទុសិស្សម្នាក់ត្រូវបានបញ្ចូលពីរដង");
      seen.add(key);
      if (score === "" && !existing.has(key)) continue;
      await q.query(`insert into portal_scores (key, class_name, student_id, subject, assessment, date, max_score, score, notes, updated_at, actor)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (key) do update set max_score = excluded.max_score, score = excluded.score, notes = excluded.notes,
          updated_at = excluded.updated_at, actor = excluded.actor`,
        [key, cls, id, course, exam, day, String(maximum), String(score), String(item.notes || "").trim().slice(0, 500), now, current.actor]);
    }
    return { saved: seen.size, className: cls, subject: course, assessment: exam, date: day };
  });
}

async function activities(token: unknown, className: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  const { rows } = await db().query(`select id, date, title, details, updated_at, actor from portal_activities
    where class_name = $1 order by date desc, updated_at desc limit 100`, [cls]);
  return rows.map(row => ({ id: row.id, date: row.date, title: row.title, details: row.details, updatedAt: row.updated_at, actor: row.actor }));
}

async function saveActivity(token: unknown, className: unknown, activity: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  const value = activity && typeof activity === "object" ? activity as Record<string, unknown> : {};
  const date = portalDate(value.date);
  const title = String(value.title || "").trim().slice(0, 150);
  const details = String(value.details || "").trim().slice(0, 3000);
  if (!title) throw new Error("សូមបញ្ចូលចំណងជើងសកម្មភាព");
  return withWriteLock(async q => {
    const wanted = String(value.id || "").trim();
    if (wanted) {
      const { rows } = await q.query("select class_name from portal_activities where id = $1", [wanted]);
      if (!rows.length || rows[0].class_name !== cls) throw new Error("មិនមានសិទ្ធិកែសកម្មភាពនេះ");
    }
    const id = wanted || randomUUID();
    await q.query(`insert into portal_activities (id, class_name, date, title, details, updated_at, actor) values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (id) do update set date = excluded.date, title = excluded.title, details = excluded.details,
        updated_at = excluded.updated_at, actor = excluded.actor`,
      [id, cls, date, title, details, new Date().toISOString(), current.actor]);
    return { id, className: cls, title };
  });
}

async function updateStudent(token: unknown, className: unknown, studentId: unknown, changes: unknown, expectedUpdatedAt: unknown) {
  const current = await session(token, false);
  const cls = await assertClass(current, className);
  const id = String(studentId || "").trim();
  if (!id || !changes || typeof changes !== "object") throw new Error("ព័ត៌មានសិស្សមិនត្រឹមត្រូវ");
  const edits = changes as Record<string, unknown>;
  return withWriteLock(async q => {
    const { rows } = await q.query("select * from students where id = $1", [id]);
    if (!rows.length) throw new Error("រកមិនឃើញសិស្ស");
    const raw = rows[0];
    const camel = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value]));
    const student = rowToStudent(camel) as Record<string, string>;
    if (String(student.className || "").trim() !== cls) throw new Error("សិស្សមិនស្ថិតក្នុងថ្នាក់នេះ");
    if (String(expectedUpdatedAt || "") !== String(student.updatedAt || "")) throw new Error("ព័ត៌មានសិស្សបានផ្លាស់ប្តូរនៅឧបករណ៍ផ្សេង។ សូមផ្ទុកឡើងវិញ");
    EDITABLE_FIELDS.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(edits, field)) student[field] = String(edits[field] || "").trim().slice(0, 160);
    });
    student.studentName = [student.studentSurname, student.studentGivenName].filter(Boolean).join(" ").trim();
    if (!student.studentName) throw new Error("ឈ្មោះសិស្សមិនអាចទទេបាន");
    if (student.gender && !["ប្រុស", "ស្រី"].includes(student.gender)) throw new Error("ភេទមិនត្រឹមត្រូវ");
    if (student.dob) portalDate(student.dob);
    if (student.studentName !== String(raw.student_name || "").trim()) {
      const { rows: duplicates } = await q.query(
        "select 1 from students where id <> $1 and regexp_replace(trim(student_name), '\\s+', ' ', 'g') = $2 limit 1",
        [id, student.studentName.replace(/\s+/g, " ")]);
      if (duplicates.length) throw new Error("ឈ្មោះសិស្សនេះមានរួចហើយ");
    }
    student.updatedAt = new Date().toISOString();
    const fields = EDITABLE_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(edits, field)).concat(["studentName", "updatedAt"]);
    const assignments = fields.map((field, index) => `${field.replace(/[A-Z]/g, l => "_" + l.toLowerCase())} = $${index + 2}`).join(", ");
    await q.query(`update students set ${assignments} where id = $1`, [id, ...fields.map(field => student[field])]);
    await touchRevision(q, DATA_REVISION);
    return { id, studentCode: student.studentCode, updatedAt: student.updatedAt };
  });
}

// Names match the former google.script.run functions so the portal page only
// swaps its transport.
export const PORTAL_RPC: Record<string, (...args: any[]) => Promise<unknown>> = {
  teacherPortalClasses: () => portalClasses(),
  teacherPortalLogin: login,
  teacherPortalLogout: logout,
  teacherPortalAdminOverview: adminOverview,
  teacherPortalIssueClassPin: issueClassPin,
  teacherPortalIssueAllClassCodes: issueAllClassCodes,
  teacherPortalDisableClassPin: disableClassPin,
  teacherPortalAssignMissingCodes: assignMissingCodes,
  teacherPortalRoster: rosterFor,
  teacherPortalPhotos: photos,
  teacherPortalAttendance: attendance,
  teacherPortalSaveAttendance: saveAttendance,
  teacherPortalScores: scores,
  teacherPortalSaveScores: saveScores,
  teacherPortalActivities: activities,
  teacherPortalSaveActivity: saveActivity,
  teacherPortalUpdateStudent: updateStudent
};
