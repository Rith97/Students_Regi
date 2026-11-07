// Student Registration API on Neon Functions.
// "/"            — the admin app's protocol, unchanged from the Apps Script web
//                  app: GET ?action=…&key=…[&callback=…] and POST text/plain JSON.
// "/portal/rpc"  — the teacher portal: { name, args } → { ok, result | error }.
import { Hono, type Context } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  db, withWriteLock, readStudents, countStudents, findStudent, getRevision, touchRevision,
  DATA_REVISION, SETTINGS_REVISION
} from "./db.ts";
import {
  readAppSettings, writeAppSettings, assignMissingStudentCodes, normalizeIncomingStudent, mergeStudents,
  replaceStudents, upsertStudent, restoreMissingPhotos, migratePhotoBatch, deleteStudent, moveStudentClass
} from "./students.ts";
import { photoForClient, photoStorageKind, photoStoredSourceLength } from "./photos.ts";
import { PORTAL_RPC, adminCredential, pinMatches, failureCount, recordFailure, clearFailures } from "./portal.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};
const CALLBACK = /^[A-Za-z_$][\w$]{0,100}$/;

function output(c: Context, payload: unknown, callback?: string) {
  const json = JSON.stringify(payload);
  if (callback && CALLBACK.test(callback)) {
    return c.body(`${callback}(${json});`, 200, { ...CORS, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
  }
  return c.body(json, 200, { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
}

function sameSecret(supplied: string, expected: string): boolean {
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function clientKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
  return "admin:" + createHash("sha256").update(forwarded.split(",")[0].trim()).digest("hex").slice(0, 32);
}

// Admin access: the portal's admin code when one is set, otherwise the
// STUDENT_APP_ACCESS_KEY secret. Unlike the Apps Script, an unconfigured
// deployment is closed rather than open.
async function assertAuthorized(c: Context, supplied: string) {
  const throttle = clientKey(c);
  if (await failureCount(throttle) >= 30) throw new Error("Unauthorized: too many attempts; wait 15 minutes");
  const admin = await adminCredential(db());
  const envKey = String(process.env.STUDENT_APP_ACCESS_KEY || "").trim();
  const ok = admin ? pinMatches(admin, supplied) : envKey ? sameSecret(supplied, envKey) : false;
  if (!ok) {
    await recordFailure(throttle);
    throw new Error(admin || envKey ? "Unauthorized: admin access key is missing or incorrect"
      : "Unauthorized: no admin credential is configured");
  }
  await clearFailures(throttle);
}

async function ensureMissingCodes() {
  const count = await withWriteLock(async q => {
    const assigned = await assignMissingStudentCodes(q);
    if (assigned) await touchRevision(q, DATA_REVISION);
    return assigned;
  });
  return count;
}

async function handleGet(c: Context) {
  const params = c.req.query();
  const action = String(params.action || "list").toLowerCase();
  const callback = params.callback;
  try {
    if (action === "teacherportal" && process.env.PORTAL_URL) return c.redirect(process.env.PORTAL_URL, 302);
    await assertAuthorized(c, String(params.key || "").trim());
    const pool = db();
    if (action === "status") {
      return output(c, { ok: true, backend: "neon",
        capabilities: { studentLatinName: true, portalRememberLogin: true, drivePhotoStorage: true, objectPhotoStorage: true },
        revision: await getRevision(pool, DATA_REVISION), settingsRevision: await getRevision(pool, SETTINGS_REVISION) }, callback);
    }
    if (action === "photostatus") {
      const { rows } = await pool.query("select student_code, photo = '' as missing from students order by row_order, id");
      return output(c, { ok: true, total: rows.length, missing: rows.filter(row => row.missing).length,
        missingCodes: rows.filter(row => row.missing).map(row => String(row.student_code || "").trim()).filter(Boolean),
        revision: await getRevision(pool, DATA_REVISION) }, callback);
    }
    if (action === "studentstatus") {
      const key = String(params.studentId || "").trim();
      const student = key ? await findStudent(pool, key) : null;
      const photo = String(student?.photo || "");
      const kind = photoStorageKind(photo);
      return output(c, { ok: true, found: !!student, recordId: student?.id || "", studentCode: student?.studentCode || "",
        className: student?.className || "", updatedAt: student?.updatedAt || "", hasPhoto: !!photo.trim(),
        photoLength: await photoStoredSourceLength(photo),
        // The app confirms uploads with photoStorage === "drive"; private object storage plays that role now.
        photoStorage: kind === "storage" ? "drive" : kind }, callback);
    }
    if (action === "list") {
      await ensureMissingCodes();
      return output(c, { ok: true, students: await readStudents(pool), settings: await readAppSettings(pool),
        revision: await getRevision(pool, DATA_REVISION), settingsRevision: await getRevision(pool, SETTINGS_REVISION) }, callback);
    }
    if (action === "listpage") {
      const requestedOffset = Number(params.offset || 0);
      if (!Number.isFinite(requestedOffset) || requestedOffset <= 0) await ensureMissingCodes();
      const total = await countStudents(pool);
      const offset = Number.isFinite(requestedOffset) ? Math.min(total, Math.max(0, Math.floor(requestedOffset))) : 0;
      const includePhotos = String(params.includePhotos || "1") !== "0";
      const requestedLimit = Number(params.limit || 64);
      const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 64;
      const students = await readStudents(pool, { includePhotos, offset, limit });
      if (includePhotos) for (const student of students) student.photo = await photoForClient(student.photo);
      return output(c, { ok: true, students, offset, limit, total,
        settings: offset === 0 ? await readAppSettings(pool) : undefined,
        revision: await getRevision(pool, DATA_REVISION), settingsRevision: await getRevision(pool, SETTINGS_REVISION) }, callback);
    }
    if (action === "photos") {
      const keys = String(params.studentIds || params.ids || "").split(",").map(value => value.trim()).filter(Boolean).slice(0, 24);
      if (!keys.length) return output(c, { ok: true, students: [] }, callback);
      const { rows } = await pool.query("select id, student_code, photo from students where id = any($1) or student_code = any($1) order by row_order", [keys]);
      const students = await Promise.all(rows.map(async row => ({ id: row.id, studentCode: row.student_code, photo: await photoForClient(row.photo) })));
      return output(c, { ok: true, students, revision: await getRevision(pool, DATA_REVISION) }, callback);
    }
    if (action === "identities") {
      await ensureMissingCodes();
      const { rows } = await pool.query(`select id, student_code as "studentCode", student_name as "studentName",
        student_surname as "studentSurname", student_given_name as "studentGivenName" from students order by row_order, id`);
      return output(c, { ok: true, students: rows.filter(row => row.id || row.studentCode || row.studentName),
        revision: await getRevision(pool, DATA_REVISION) }, callback);
    }
    if (action === "photostorage") {
      const { rows } = await pool.query("select photo from students");
      const counts = { storage: 0, sheet: 0, url: 0, drive: 0, missing: 0, unknown: 0 } as Record<string, number>;
      rows.forEach(row => { counts[photoStorageKind(row.photo)]++; });
      return output(c, { ok: true, total: rows.length, drive: counts.storage, legacy: counts.sheet + counts.url + counts.drive,
        embedded: counts.sheet, url: counts.url, unreadableDrive: counts.drive, missing: counts.missing, unknown: counts.unknown,
        nextCursor: 2, revision: await getRevision(pool, DATA_REVISION) }, callback);
    }
    if (action === "setup" || action === "design" || action === "format") {
      return output(c, { ok: true, action, count: await countStudents(pool) }, callback);
    }
    return output(c, { ok: false, error: "Unknown action" }, callback);
  } catch (error) {
    return output(c, { ok: false, error: String((error as Error)?.message || error) }, callback);
  }
}

async function handlePost(c: Context) {
  try {
    const body = JSON.parse((await c.req.text()) || "{}");
    await assertAuthorized(c, String(body.accessKey || c.req.query("key") || "").trim());
    const action = String(body.action || "").toLowerCase();
    const rows = Array.isArray(body.students) ? body.students : [];
    if (action === "backup" || action === "upsertmany") {
      const count = await withWriteLock(async q => {
        const merged = await mergeStudents(q, rows.map(normalizeIncomingStudent));
        await touchRevision(q, DATA_REVISION);
        return merged;
      });
      return output(c, { ok: true, action, mode: "merge", count });
    }
    if (action === "replace") {
      await withWriteLock(async q => {
        await replaceStudents(q, rows.map(normalizeIncomingStudent));
        await touchRevision(q, DATA_REVISION);
      });
      return output(c, { ok: true, action, mode: "replace", count: rows.length });
    }
    if (action === "upsert") {
      const student = normalizeIncomingStudent(body);
      await withWriteLock(async q => {
        await upsertStudent(q, student);
        await touchRevision(q, DATA_REVISION);
      });
      return output(c, { ok: true, action, studentId: student.studentCode || student.id });
    }
    if (action === "recoverphotos") {
      const restored = await withWriteLock(async q => {
        const count = await restoreMissingPhotos(q, rows);
        if (count) await touchRevision(q, DATA_REVISION);
        return count;
      });
      return output(c, { ok: true, action, restored });
    }
    if (action === "migratephotos") {
      const result = await withWriteLock(async q => {
        const migrated = await migratePhotoBatch(q, body.cursor, body.limit);
        if (migrated.migrated) await touchRevision(q, DATA_REVISION);
        return migrated;
      });
      return output(c, { ok: true, action, ...result });
    }
    if (action === "delete") {
      const deleted = await withWriteLock(async q => {
        const result = await deleteStudent(q, {
          recordId: (body.student && (body.student.recordId || body.student.id)) || body.studentId,
          studentCode: body.student && body.student.studentCode
        });
        if (result) await touchRevision(q, DATA_REVISION);
        return result;
      });
      return output(c, { ok: true, action, deleted });
    }
    if (action === "moveclass") {
      const result = await withWriteLock(async q => {
        const moved = await moveStudentClass(q, body.studentId, body.student || {});
        if (moved.changed) await touchRevision(q, DATA_REVISION);
        return moved;
      });
      return output(c, { ok: true, action, ...result });
    }
    if (action === "settings") {
      const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
      await withWriteLock(async q => {
        await writeAppSettings(q, settings);
        await touchRevision(q, SETTINGS_REVISION);
      });
      return output(c, { ok: true, action });
    }
    if (action === "setup" || action === "design" || action === "format") {
      return output(c, { ok: true, action, count: await countStudents(db()) });
    }
    return output(c, { ok: false, error: "Unknown action" });
  } catch (error) {
    return output(c, { ok: false, error: String((error as Error)?.message || error) });
  }
}

async function handlePortal(c: Context) {
  try {
    const body = await c.req.json().catch(() => ({}));
    const name = String(body?.name || "");
    const handler = Object.prototype.hasOwnProperty.call(PORTAL_RPC, name) ? PORTAL_RPC[name] : null;
    if (!handler) return output(c, { ok: false, error: "Unknown portal action" });
    const args = Array.isArray(body.args) ? body.args.slice(0, 8) : [];
    return output(c, { ok: true, result: await handler(...args) });
  } catch (error) {
    return output(c, { ok: false, error: String((error as Error)?.message || error) });
  }
}

const app = new Hono();
app.options("*", c => c.body(null, 204, CORS));
app.get("/", handleGet);
app.post("/", handlePost);
app.post("/portal/rpc", handlePortal);
app.get("/health", async c => {
  await db().query("select 1");
  return output(c, { ok: true });
});
app.notFound(c => output(c, { ok: false, error: "Not found" }));

export default app;
