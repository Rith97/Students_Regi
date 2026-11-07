import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@neon/functions";
import { randomUUID } from "node:crypto";

export const HEADERS = [
  "id", "studentCode", "studentName", "gender", "dob", "className", "fromSchool",
  "pobVillage", "pobCommune", "pobDistrict", "pobProvince", "contact", "fatherName", "motherName",
  "currentVillage", "currentCommune", "currentDistrict", "currentProvince", "photo", "createdAt", "updatedAt",
  "studentSurname", "studentGivenName", "fatherOccupation", "motherOccupation", "guardianName",
  "applicationNumber", "fatherPhone", "motherPhone", "fatherDob", "motherDob", "guardianDob",
  "classTrack", "studentLatinName"
] as const;
export type StudentField = typeof HEADERS[number];
export type Student = Record<StudentField, string> & { __hasStudentLatinName?: boolean; __photoChanged?: boolean };

export const column = (field: string) => field.replace(/[A-Z]/g, letter => "_" + letter.toLowerCase());
const COLUMNS = HEADERS.map(column);
const SELECT_ALL = COLUMNS.map((name, index) => `${name} as "${HEADERS[index]}"`).join(", ");
const SELECT_NO_PHOTO = COLUMNS.map((name, index) => HEADERS[index] === "photo" ? `'' as "photo"` : `${name} as "${HEADERS[index]}"`).join(", ");

export const DATA_REVISION = "STUDENT_DATA_REVISION";
export const SETTINGS_REVISION = "STUDENT_SETTINGS_REVISION";

let pool: Pool | null = null;
export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    pool = new Pool({ connectionString, max: 5 });
    attachDatabasePool(pool);
  }
  return pool;
}

export type Queryable = Pick<PoolClient, "query">;

// Serialises every write, like Apps Script's LockService.getScriptLock().
export async function withWriteLock<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(902001)");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function cell(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function emptyStudent(): Student {
  const student = {} as Student;
  HEADERS.forEach(field => { student[field] = ""; });
  return student;
}

// Same fallbacks as rowToStudent_ in the Apps Script backend.
export function rowToStudent(row: Record<string, unknown>): Student {
  const student = emptyStudent();
  HEADERS.forEach(field => { student[field] = cell(row[field]); });
  if (!student.studentName) student.studentName = [student.studentSurname, student.studentGivenName].filter(Boolean).join(" ");
  if (!student.studentSurname && !student.studentGivenName && student.studentName) {
    const parts = student.studentName.trim().split(/\s+/).filter(Boolean);
    student.studentSurname = parts.shift() || "";
    student.studentGivenName = parts.join(" ");
  }
  return student;
}

export async function readStudents(q: Queryable, { includePhotos = true, offset = 0, limit = null as number | null } = {}): Promise<Student[]> {
  const params: unknown[] = [];
  let sql = `select ${includePhotos ? SELECT_ALL : SELECT_NO_PHOTO} from students order by row_order, id`;
  if (limit !== null) { params.push(limit, offset); sql += ` limit $1 offset $2`; }
  const { rows } = await q.query(sql, params);
  return rows.map(rowToStudent);
}

export async function countStudents(q: Queryable): Promise<number> {
  const { rows } = await q.query("select count(*)::int as n from students");
  return rows[0].n;
}

export async function findStudent(q: Queryable, key: string): Promise<Student | null> {
  const { rows } = await q.query(`select ${SELECT_ALL} from students where id = $1 or student_code = $1 order by (id = $1) desc, row_order limit 1`, [key]);
  return rows.length ? rowToStudent(rows[0]) : null;
}

function rowValues(student: Student): string[] {
  return HEADERS.map(field => cell(student[field]));
}

export async function insertStudent(q: Queryable, student: Student, rowOrder?: number): Promise<void> {
  const order = rowOrder ?? (await q.query("select coalesce(max(row_order), 0) + 1 as n from students")).rows[0].n;
  const placeholders = COLUMNS.map((_, index) => `$${index + 2}`).join(", ");
  await q.query(`insert into students (row_order, ${COLUMNS.join(", ")}) values ($1, ${placeholders})`, [order, ...rowValues(student)]);
}

export async function updateStudent(q: Queryable, id: string, student: Student): Promise<void> {
  const assignments = COLUMNS.map((name, index) => `${name} = $${index + 2}`).join(", ");
  await q.query(`update students set ${assignments} where id = $1`, [id, ...rowValues(student)]);
}

// Replaces the whole table in the given order (writeStudents_ in Apps Script).
export async function replaceAllStudents(q: Queryable, students: Student[]): Promise<void> {
  await q.query("delete from students");
  const chunk = 400;
  for (let start = 0; start < students.length; start += chunk) {
    const slice = students.slice(start, start + chunk);
    const params: unknown[] = [];
    const tuples = slice.map((student, index) => {
      const base = params.length;
      params.push(start + index + 1, ...rowValues(student));
      return `(${Array.from({ length: COLUMNS.length + 1 }, (_, i) => `$${base + i + 1}`).join(", ")})`;
    });
    await q.query(`insert into students (row_order, ${COLUMNS.join(", ")}) values ${tuples.join(", ")}`, params);
  }
}

export async function getRevision(q: Queryable, name: string): Promise<string> {
  const { rows } = await q.query("select value from revisions where name = $1", [name]);
  return rows.length ? rows[0].value : "0";
}

export async function touchRevision(q: Queryable, name: string): Promise<string> {
  const value = randomUUID();
  await q.query("insert into revisions (name, value) values ($1, $2) on conflict (name) do update set value = excluded.value", [name, value]);
  return value;
}
