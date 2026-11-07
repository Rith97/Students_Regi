// Port of google-sheet-backend.gs. Behaviour (merge rules, duplicate-name
// protection, student-code allocation) is kept identical; the Sheet is
// replaced by the students table and LockService by withWriteLock.
import { randomUUID } from "node:crypto";
import {
  HEADERS, type Student, type Queryable, cell, emptyStudent, readStudents, findStudent, insertStudent,
  updateStudent, replaceAllStudents
} from "./db.ts";
import { savePhoto, photoObjectKey, photoStorageKind } from "./photos.ts";

export const STUDENT_SCHOOL_CODE = "902";

// ---------- settings ----------
export type AppSettings = {
  issueDate: string; principalName: string; principalPhone?: string; cardLunarDate?: string; ictPhone?: string;
  studentCodePrefix: string; studentCodeDigits: number; academicYearStart: number; classTeachers: Record<string, string>;
};

function phnomPenhYear(): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Phnom_Penh", year: "numeric" }).format(new Date()));
}

export async function readAppSettings(q: Queryable): Promise<AppSettings> {
  const settings: AppSettings = { issueDate: "", principalName: "", studentCodePrefix: "STU", studentCodeDigits: 4,
    academicYearStart: phnomPenhYear(), classTeachers: {} };
  const { rows } = await q.query("select key, value from app_settings");
  for (const row of rows) {
    const key = String(row.key || "").trim();
    const value = String(row.value || "");
    if (["issueDate", "cardLunarDate", "principalName", "principalPhone", "ictPhone", "studentCodePrefix"].includes(key)) {
      (settings as Record<string, unknown>)[key] = value.trim();
    }
    if (key === "studentCodeDigits") settings.studentCodeDigits = Number(value) || 4;
    if (key === "academicYearStart") settings.academicYearStart = Number(value) || settings.academicYearStart;
    if (key === "classTeachers") {
      try {
        const parsed = JSON.parse(value || "{}");
        settings.classTeachers = parsed && typeof parsed === "object" ? parsed : {};
      } catch { settings.classTeachers = {}; }
    }
  }
  return settings;
}

export async function writeAppSettings(q: Queryable, settings: Record<string, any>): Promise<void> {
  const safeTeachers = settings.classTeachers && typeof settings.classTeachers === "object" ? settings.classTeachers : {};
  const requestedYear = Number(settings.academicYearStart);
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2099
    ? requestedYear : (await readAppSettings(q)).academicYearStart;
  const rows: [string, string][] = [
    ["issueDate", String(settings.issueDate || "").trim()],
    ["principalName", String(settings.principalName || "").trim()],
    ["principalPhone", String(settings.principalPhone || "").trim()],
    ["cardLunarDate", String(settings.cardLunarDate || "").trim()],
    ["ictPhone", String(settings.ictPhone || "").trim()],
    ["studentCodePrefix", String(settings.studentCodePrefix || "STU").trim()],
    ["studentCodeDigits", String(Math.min(8, Math.max(2, Number(settings.studentCodeDigits) || 4)))],
    ["academicYearStart", String(academicYear)],
    ["classTeachers", JSON.stringify(safeTeachers)]
  ];
  await q.query("delete from app_settings");
  for (const [key, value] of rows) await q.query("insert into app_settings (key, value) values ($1, $2)", [key, value]);
}

// ---------- names ----------
export function studentNameKey(student: Partial<Student> | null | undefined): string {
  const name = String((student && student.studentName) || [student && student.studentSurname, student && student.studentGivenName].filter(Boolean).join(" ") || "");
  return name.normalize("NFC").replace(/[​-‍⁠﻿]/g, "").toLocaleLowerCase().replace(/[\s ]+/g, "");
}

export function sameStudentName(left: Partial<Student>, right: Partial<Student>): boolean {
  const leftName = studentNameKey(left);
  return !!leftName && leftName === studentNameKey(right);
}

function dedupeStudentsByName(students: Student[]): Student[] {
  const names = new Set<string>();
  return students.filter(student => {
    const key = studentNameKey(student);
    if (!key) return true;
    if (names.has(key)) return false;
    names.add(key);
    return true;
  });
}

const className = (student: Partial<Student>) => String((student && student.className) || "មិនទាន់មានថ្នាក់").trim() || "មិនទាន់មានថ្នាក់";

function sortStudents(students: Student[]): Student[] {
  return students.slice().sort((a, b) =>
    className(a).localeCompare(className(b), "km-KH")
    || String(a.studentName || "").localeCompare(String(b.studentName || ""), "km-KH")
    || String(a.studentCode || "").localeCompare(String(b.studentCode || ""), "km-KH"));
}

// ---------- student codes ----------
export function studentCodeGrade(name: unknown): number | null {
  const text = String(name || "").replace(/[០-៩]/g, digit => String(digit.charCodeAt(0) - 0x17E0))
    .replace(/^\s*(?:ថ្នាក់ទី|ថ្នាក់|ទី)\s*/, "").trim();
  const match = text.match(/^(1[0-2]|[7-9])(?=\D|$)/);
  return match ? Number(match[1]) : null;
}

export function studentCodeStem(name: unknown, academicYear: number): string {
  const grade = studentCodeGrade(name);
  if (!grade) return "";
  return STUDENT_SCHOOL_CODE + String((academicYear - (grade - 7)) % 100).padStart(2, "0") + String(grade).padStart(2, "0");
}

export function allocateStudentCode(name: unknown, previousCode: unknown, otherCodes: unknown[], academicYear: number): string {
  const stem = studentCodeStem(name, academicYear);
  const previous = String(previousCode || "").trim();
  if (!stem) return previous;
  const used = new Set((otherCodes || []).map(code => String(code || "").trim()));
  if (previous.startsWith(stem) && /^\d{3}$/.test(previous.slice(stem.length)) && !used.has(previous)) return previous;
  let maximum = 0;
  used.forEach(code => {
    if (code.startsWith(stem) && /^\d{3}$/.test(code.slice(stem.length))) maximum = Math.max(maximum, Number(code.slice(stem.length)));
  });
  if (maximum >= 999) throw new Error("Student code sequence is full for " + stem);
  return stem + String(maximum + 1).padStart(3, "0");
}

export async function studentCodeAcademicYear(q: Queryable): Promise<number> {
  const year = Number((await readAppSettings(q)).academicYearStart);
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("Academic year must be 2000–2099");
  return year;
}

function normalizeStudentCodes(students: Student[], academicYear: number): Student[] {
  const used = new Set<string>();
  students.forEach(student => {
    const code = String(student.studentCode || "").trim();
    const stem = studentCodeStem(student.className, academicYear);
    if ((!stem || (code.startsWith(stem) && /^\d{3}$/.test(code.slice(stem.length)))) && code && !used.has(code)) used.add(code);
    else if (stem) student.studentCode = "";
  });
  students.forEach(student => {
    if (!studentCodeStem(student.className, academicYear) || student.studentCode) return;
    student.studentCode = allocateStudentCode(student.className, "", [...used], academicYear);
    used.add(student.studentCode);
  });
  return students;
}

// Gives every named grade 7–12 student without a code a server-allocated one.
export async function assignMissingStudentCodes(q: Queryable): Promise<number> {
  const { rows } = await q.query(`select id, student_code, student_name, student_surname, student_given_name, class_name, created_at
    from students order by row_order, id`);
  const used = new Set<string>(rows.map(row => String(row.student_code || "").trim()).filter(Boolean));
  const academicYear = await studentCodeAcademicYear(q);
  let count = 0;
  for (const row of rows) {
    if (String(row.student_code || "").trim()) continue;
    const name = String(row.student_name || [row.student_surname, row.student_given_name].filter(Boolean).join(" ")).trim();
    const cls = String(row.class_name || "").trim();
    if (!name || !studentCodeGrade(cls)) continue;
    const code = allocateStudentCode(cls, "", [...used], academicYear);
    if (!code) continue;
    used.add(code);
    const now = new Date().toISOString();
    await q.query("update students set student_code = $2, created_at = coalesce(nullif(created_at, ''), $3), updated_at = $3 where id = $1",
      [row.id, code, now]);
    count++;
  }
  return count;
}

// ---------- incoming records ----------
export function normalizeIncomingStudent(item: any): Student {
  item = item || {};
  const student = item.student && typeof item.student === "object" ? item.student : item;
  const now = new Date().toISOString();
  const normalized = emptyStudent();
  HEADERS.forEach(key => { normalized[key] = cell(student[key]); });
  normalized.__hasStudentLatinName = Object.prototype.hasOwnProperty.call(student, "__hasStudentLatinName")
    ? student.__hasStudentLatinName === true
    : Object.prototype.hasOwnProperty.call(student, "studentLatinName");
  normalized.__photoChanged = student.__photoChanged === true || student.photoChanged === true;
  normalized.id = cell(student.recordId || student.id || student.studentCode || item.studentId);
  normalized.studentCode = cell(student.studentCode || item.studentId || student.studentId);
  normalized.studentSurname = cell(student.studentSurname);
  normalized.studentGivenName = cell(student.studentGivenName);
  normalized.studentName = cell(student.studentName || [normalized.studentSurname, normalized.studentGivenName].filter(Boolean).join(" "));
  if ((!normalized.studentSurname || !normalized.studentGivenName) && normalized.studentName) {
    const parts = normalized.studentName.trim().split(/\s+/).filter(Boolean);
    if (!normalized.studentSurname && normalized.studentGivenName && normalized.studentName.endsWith(normalized.studentGivenName)) {
      normalized.studentSurname = normalized.studentName.slice(0, -normalized.studentGivenName.length).trim();
    }
    if (!normalized.studentGivenName && normalized.studentSurname && normalized.studentName.indexOf(normalized.studentSurname) === 0) {
      normalized.studentGivenName = normalized.studentName.slice(normalized.studentSurname.length).trim();
    }
    if (!normalized.studentSurname) normalized.studentSurname = parts[0] || "";
    if (!normalized.studentGivenName && parts.length > 1) normalized.studentGivenName = parts.slice(1).join(" ");
  }
  normalized.createdAt = cell(student.createdAt) || now;
  normalized.updatedAt = cell(student.updatedAt) || now;
  return normalized;
}

export function mergeStudentRecord(existing: Student, incoming: Student): Student {
  const merged = { ...existing, ...incoming } as Student;
  if (incoming && incoming.__hasStudentLatinName === false) merged.studentLatinName = String((existing && existing.studentLatinName) || "");
  // Never let a text-only edit or an offline retry clear a stored photo or name.
  (["studentName", "studentSurname", "studentGivenName", "photo", "classTrack"] as const).forEach(field => {
    if (!String((incoming && incoming[field]) || "").trim() && String((existing && existing[field]) || "").trim()) merged[field] = existing[field];
  });
  if (!String(merged.studentName || "").trim()) merged.studentName = [merged.studentSurname, merged.studentGivenName].filter(Boolean).join(" ");
  return merged;
}

export async function photoForStoredRecord(incoming: Student, existing: Student): Promise<string> {
  const next = String((incoming && incoming.photo) || "").trim();
  const previous = String((existing && existing.photo) || "").trim();
  if (!next) return previous;
  // A retried no-cors mutation that already reached the database reuses its file.
  if (photoObjectKey(previous) && String(incoming.updatedAt || "") && String(incoming.updatedAt) === String(existing.updatedAt || "")) return previous;
  // Bulk backups carry hydrated copies of stored photos; replace only on an explicit change.
  if (photoObjectKey(previous) && incoming.__photoChanged !== true) return previous;
  return savePhoto(next, incoming);
}

function stripFlags(student: Student): Student {
  const clean = emptyStudent();
  HEADERS.forEach(field => { clean[field] = cell(student[field]); });
  if (!clean.id) clean.id = randomUUID();
  return clean;
}

// writeStudents_: dedupe by name, normalise codes, sort by class/name, rewrite.
async function writeStudents(q: Queryable, students: Student[]): Promise<void> {
  const academicYear = await studentCodeAcademicYear(q);
  const sorted = sortStudents(normalizeStudentCodes(dedupeStudentsByName(students.map(normalizeIncomingStudent)), academicYear));
  await replaceAllStudents(q, sorted.map(stripFlags));
}

export async function replaceStudents(q: Queryable, students: Student[]): Promise<void> {
  if (!students.length) return writeStudents(q, []);
  const oldByKey = new Map<string, Student>();
  (await readStudents(q)).forEach(student => {
    [student.id, student.studentCode].filter(Boolean).forEach(key => oldByKey.set(String(key).trim(), student));
  });
  const next: Student[] = [];
  for (const student of students) {
    const previous = oldByKey.get(String(student.id || "").trim()) || oldByKey.get(String(student.studentCode || "").trim());
    if (!previous) {
      student.photo = await savePhoto(student.photo, student);
      next.push(student);
      continue;
    }
    student.photo = await photoForStoredRecord(student, previous);
    const merged = mergeStudentRecord(previous, student);
    merged.studentCode = previous.studentCode;
    next.push(merged);
  }
  await writeStudents(q, next);
}

function studentMatchesKey(student: Partial<Student> & { studentId?: string }, key: string): boolean {
  if (!key) return false;
  return String(student.id || "").trim() === key || String(student.studentCode || student.studentId || "").trim() === key;
}

export async function mergeStudents(q: Queryable, incomingStudents: Student[]): Promise<number> {
  await assignMissingStudentCodes(q);
  const students = await readStudents(q);
  for (const incoming of incomingStudents) {
    const student = normalizeIncomingStudent(incoming);
    const key = String(student.id || student.studentCode || "").trim();
    const keyIndex = students.findIndex(existing => studentMatchesKey(existing, key));
    if (keyIndex >= 0) {
      const createdAt = students[keyIndex].createdAt;
      const assignedCode = students[keyIndex].studentCode;
      student.photo = await photoForStoredRecord(student, students[keyIndex]);
      students[keyIndex] = mergeStudentRecord(students[keyIndex], student);
      students[keyIndex].studentCode = assignedCode;
      if (createdAt) students[keyIndex].createdAt = createdAt;
      continue;
    }
    // A different record with the same normalised Khmer name is a duplicate.
    if (students.some(existing => sameStudentName(existing, student))) continue;
    student.photo = await savePhoto(student.photo, student);
    students.push(student);
  }
  await writeStudents(q, students);
  return incomingStudents.length;
}

export async function upsertStudent(q: Queryable, student: Student): Promise<void> {
  const key = String(student.id || student.studentCode || "").trim();
  if (!key) throw new Error("Student record ID is required");
  await assignMissingStudentCodes(q);
  const { rows: identities } = await q.query("select id, student_code, student_name, student_surname, student_given_name from students order by row_order, id");
  const academicYear = await studentCodeAcademicYear(q);
  const matching = identities.find(row => row.id === key);
  if (matching) {
    const existing = (await findStudent(q, key))!;
    student.photo = await photoForStoredRecord(student, existing);
    const merged = mergeStudentRecord(existing, student);
    merged.studentCode = allocateStudentCode(merged.className, existing.studentCode,
      identities.filter(row => row.id !== key).map(row => row.student_code), academicYear);
    merged.createdAt = existing.createdAt || student.createdAt;
    await updateStudent(q, key, stripFlags(merged));
    student.studentCode = merged.studentCode;
    return;
  }
  for (const row of identities) {
    if (sameStudentName({ studentName: row.student_name, studentSurname: row.student_surname, studentGivenName: row.student_given_name }, student)) return;
  }
  student.photo = await savePhoto(student.photo, student);
  student.studentCode = allocateStudentCode(student.className, "", identities.map(row => row.student_code), academicYear);
  await insertStudent(q, stripFlags(student));
}

export async function restoreMissingPhotos(q: Queryable, incomingStudents: any[]): Promise<number> {
  const students = await readStudents(q);
  const missing = students.filter(student => !String(student.photo || "").trim() && String(student.studentCode || "").trim());
  if (!missing.length) return 0;
  const candidates = new Map<string, { name: string; photo: string }[]>();
  for (const item of incomingStudents || []) {
    const student = item && item.student ? item.student : item || {};
    const code = String(student.studentCode || "").trim();
    const photo = String(student.photo || "").trim();
    if (!code || (!photoObjectKey(photo) && !/^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(photo))) continue;
    if (!candidates.has(code)) candidates.set(code, []);
    candidates.get(code)!.push({ name: studentNameKey(student), photo });
  }
  let restored = 0;
  for (const student of missing) {
    const name = studentNameKey(student);
    const matches = (candidates.get(String(student.studentCode).trim()) || []).filter(candidate => !name || !candidate.name || candidate.name === name);
    if (!matches.length) continue;
    const unique = [...new Set(matches.map(candidate => candidate.photo))];
    // Conflicting photos require human review; never guess which photo is right.
    if (unique.length !== 1) continue;
    const reference = await savePhoto(unique[0], student);
    await q.query("update students set photo = $2 where id = $1", [student.id, reference]);
    restored++;
  }
  return restored;
}

export async function migratePhotoBatch(q: Queryable, cursor: unknown, requestedLimit: unknown) {
  const total = (await q.query("select count(*)::int as n from students")).rows[0].n as number;
  const start = Math.min(Math.max(2, Math.floor(Number(cursor) || 2)), Math.max(2, total + 2));
  const limit = Math.min(12, Math.max(1, Math.floor(Number(requestedLimit) || 6)));
  const rows = start - 2 < total ? await readStudents(q, { offset: start - 2, limit }) : [];
  let migrated = 0, failed = 0;
  for (const student of rows) {
    if (photoStorageKind(student.photo) !== "sheet") continue;
    try {
      const reference = await savePhoto(student.photo, student);
      if (!photoObjectKey(reference)) throw new Error("Storage did not return a valid photo reference");
      await q.query("update students set photo = $2 where id = $1", [student.id, reference]);
      migrated++;
    } catch (error) {
      failed++;
      console.error("Photo migration failed for", student.id, error);
    }
  }
  const end = start - 2 + rows.length;
  return { cursor: start, nextCursor: end + 2, scanned: rows.length, migrated, failed, done: end >= total, total };
}

export async function deleteStudent(q: Queryable, request: { recordId?: string; studentCode?: string }): Promise<boolean> {
  const recordId = String(request.recordId || "").trim();
  const code = String(request.studentCode || "").trim();
  if (!recordId && !code) throw new Error("Student record ID is required for deletion");
  if (recordId) {
    const { rowCount } = await q.query("delete from students where id = $1", [recordId]);
    if (rowCount) return true;
  }
  if (!code) return false;
  const { rows } = await q.query("select id from students where student_code = $1", [code]);
  if (rows.length > 1) throw new Error("Duplicate student codes; deletion needs review");
  if (!rows.length) return false;
  const candidateId = String(rows[0].id || "").trim();
  if (recordId && candidateId && candidateId !== recordId && candidateId !== code) throw new Error("Record ID mismatch; deletion needs review");
  await q.query("delete from students where id = $1", [candidateId]);
  return true;
}

export async function moveStudentClass(q: Queryable, recordId: unknown, change: any) {
  const id = String(recordId || change.recordId || change.id || "").trim();
  const target = String(change.className || "").trim();
  if (!id) throw new Error("Student record ID is required for class transfer");
  if (!studentCodeGrade(target)) throw new Error("Class must be grade 7–12");
  const { rows } = await q.query("select id, student_code, class_name from students order by row_order, id");
  const index = rows.findIndex(row => String(row.id).trim() === id);
  if (index < 0) throw new Error("Student record not found");
  const oldClass = String(rows[index].class_name || "").trim();
  const oldCode = String(rows[index].student_code || "").trim();
  if (oldClass === target) return { changed: false, recordId: id, className: target, studentCode: oldCode };
  const code = allocateStudentCode(target, oldCode, rows.filter((_, i) => i !== index).map(row => row.student_code), await studentCodeAcademicYear(q));
  const updatedAt = String(change.updatedAt || new Date().toISOString());
  await q.query("update students set class_name = $2, student_code = $3, updated_at = $4 where id = $1", [id, target, code, updatedAt]);
  return { changed: true, recordId: id, className: target, studentCode: code, updatedAt };
}
