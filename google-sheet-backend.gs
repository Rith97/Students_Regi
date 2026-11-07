const SHEET_NAME = "Students";
const DASHBOARD_SHEET_NAME = "Dashboard";
const BY_CLASS_SHEET_NAME = "By Class";
const CLASS_SHEET_PREFIX = "Class - ";
const SETTINGS_SHEET_NAME = "_App Settings";
const ACCESS_KEY_PROPERTY = "STUDENT_APP_ACCESS_KEY";
const DATA_REVISION_PROPERTY = "STUDENT_DATA_REVISION";
const SETTINGS_REVISION_PROPERTY = "STUDENT_SETTINGS_REVISION";
const PHOTO_FOLDER_PROPERTY = "STUDENT_PHOTO_FOLDER_ID";
const PHOTO_FOLDER_NAME = "Student Registration Photos";
const PHOTO_REFERENCE_PREFIX = "drive:";
const PHOTO_MIGRATION_BATCH_LIMIT = 12;
const WRITE_LOCK_TIMEOUT_MS = 30000;
const STUDENT_SCHOOL_CODE = "902";

const HEADERS = [
  "id",
  "studentCode",
  "studentName",
  "gender",
  "dob",
  "className",
  "fromSchool",
  "pobVillage",
  "pobCommune",
  "pobDistrict",
  "pobProvince",
  "contact",
  "fatherName",
  "motherName",
  "currentVillage",
  "currentCommune",
  "currentDistrict",
  "currentProvince",
  "photo",
  "createdAt",
  "updatedAt",
  "studentSurname",
  "studentGivenName",
  "fatherOccupation",
  "motherOccupation",
  "guardianName",
  "applicationNumber",
  "fatherPhone",
  "motherPhone",
  "fatherDob",
  "motherDob",
  "guardianDob",
  "classTrack",
  "studentLatinName"
];

const HEADER_LABELS = {
  id: "លេខក្នុងប្រព័ន្ធ",
  studentCode: "អត្តលេខ",
  studentName: "គោត្តនាម-នាម",
  gender: "ភេទ",
  dob: "ថ្ងៃខែឆ្នាំកំណើត",
  className: "ថ្នាក់",
  classTrack: "ប្រភេទថ្នាក់",
  fromSchool: "សាលា",
  pobVillage: "ភូមិកំណើត",
  pobCommune: "ឃុំ/សង្កាត់កំណើត",
  pobDistrict: "ស្រុក/ខណ្ឌកំណើត",
  pobProvince: "ខេត្ត/ក្រុងកំណើត",
  contact: "លេខទូរស័ព្ទ",
  fatherName: "ឈ្មោះឪពុក",
  fatherDob: "ថ្ងៃខែឆ្នាំកំណើតឪពុក",
  motherName: "ឈ្មោះម្តាយ",
  motherDob: "ថ្ងៃខែឆ្នាំកំណើតម្តាយ",
  currentVillage: "ភូមិបច្ចុប្បន្ន",
  currentCommune: "ឃុំ/សង្កាត់បច្ចុប្បន្ន",
  currentDistrict: "ស្រុក/ខណ្ឌបច្ចុប្បន្ន",
  currentProvince: "ខេត្ត/ក្រុងបច្ចុប្បន្ន",
  photo: "រូបថត",
  createdAt: "បង្កើតនៅ",
  updatedAt: "កែចុងក្រោយ",
  studentSurname: "គោត្តនាម",
  studentGivenName: "នាមខ្លួន",
  studentLatinName: "ឈ្មោះជាអក្សរឡាតាំង",
  fatherOccupation: "មុខរបរឪពុក",
  motherOccupation: "មុខរបរម្តាយ",
  guardianName: "ឈ្មោះអាណាព្យាបាល",
  guardianDob: "ថ្ងៃខែឆ្នាំកំណើតអាណាព្យាបាល",
  applicationNumber: "លេខពាក្យ",
  fatherPhone: "លេខទូរសព្ទឪពុក",
  motherPhone: "លេខទូរសព្ទម្តាយ"
};

const VIEW_FIELDS = [
  "studentCode",
  "studentSurname",
  "studentGivenName",
  "gender",
  "dob",
  "className",
  "classTrack",
  "fromSchool",
  "contact",
  "fatherName",
  "fatherDob",
  "fatherOccupation",
  "motherName",
  "motherDob",
  "motherOccupation",
  "guardianName",
  "guardianDob",
  "pobVillage",
  "pobCommune",
  "pobDistrict",
  "pobProvince",
  "currentVillage",
  "currentCommune",
  "currentDistrict",
  "currentProvince",
  "photo",
  "fatherPhone",
  "motherPhone",
  "applicationNumber",
  "studentLatinName"
];

const HEADER_ROW = HEADERS.map(function(key) { return HEADER_LABELS[key] || key; });
const VIEW_HEADER_ROW = VIEW_FIELDS.map(function(key) { return HEADER_LABELS[key] || key; });

// Direct edits in the Students tab do not pass through the App's save endpoint.
// Assign the same server-side code as soon as a name and class are entered.
function onEdit(e) {
  try {
    const range = e && e.range;
    const sheet = range && range.getSheet();
    if (!sheet || sheet.getName() !== SHEET_NAME || range.getRow() < 2) return;
    const firstColumn = range.getColumn();
    const lastColumn = firstColumn + range.getNumColumns() - 1;
    const identityColumns = [2, 3, 6, 22, 23];
    if (!identityColumns.some(function(column) { return column >= firstColumn && column <= lastColumn; })) return;
    const firstRow = range.getRow();
    const lastRow = firstRow + range.getNumRows() - 1;
    const count = withWriteLock_(function() {
      return assignMissingStudentCodes_(sheet, firstRow, lastRow);
    });
    if (count) touchRevision_(DATA_REVISION_PROPERTY);
  } catch (err) {
    console.error("Automatic student-code assignment failed:", err);
  }
}

const STUDENT_COLUMN_WIDTHS = [90, 95, 170, 60, 105, 80, 165, 115, 135, 135, 135, 120, 130, 130, 125, 150, 150, 150, 100, 145, 145, 120, 120, 125, 125, 145, 105, 125, 125, 135, 135, 150, 165, 180];
const VIEW_COLUMN_WIDTHS = [95, 120, 120, 60, 105, 80, 165, 165, 120, 130, 135, 125, 130, 135, 125, 145, 150, 115, 135, 135, 135, 125, 150, 150, 150, 100, 125, 125, 105, 180];
const CLASS_TAB_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#15803d", "#b45309", "#be123c", "#0891b2", "#4f46e5"];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "list").toLowerCase();
    // The public landing page contains no student data. Every portal RPC checks
    // its own class-scoped session before reading or changing records.
    if (action === "teacherportal") {
      return HtmlService.createHtmlOutputFromFile("TeacherPortal").setTitle("ផ្ទាំងគ្រូបន្ទុកថ្នាក់");
    }
    assertAuthorized_(e, null);
    if (action === "status") {
      return output_({
        ok: true,
        capabilities: { studentLatinName:true, portalRememberLogin:true, drivePhotoStorage:true },
        revision: getRevision_(DATA_REVISION_PROPERTY),
        settingsRevision: getRevision_(SETTINGS_REVISION_PROPERTY)
      }, e);
    }
    if (action === "photostatus") {
      const sheet = getStudentsSheet_();
      const total = Math.max(0, sheet.getLastRow() - 1);
      const photos = total ? sheet.getRange(2, HEADERS.indexOf("photo") + 1, total, 1).getValues() : [];
      const codes = total ? sheet.getRange(2, HEADERS.indexOf("studentCode") + 1, total, 1).getDisplayValues() : [];
      const missingCodes = photos.map(function(row, index) {
        return !String(row[0] || "").trim() ? String(codes[index][0] || "").trim() : "";
      }).filter(Boolean);
      return output_({
        ok: true,
        total: total,
        missing: photos.filter(function(row) { return !String(row[0] || "").trim(); }).length,
        missingCodes: missingCodes,
        revision: getRevision_(DATA_REVISION_PROPERTY)
      }, e);
    }
    if (action === "studentstatus") {
      const key = String((e && e.parameter && e.parameter.studentId) || "").trim();
      const sheet = getStudentsSheet_();
      const lastRow = sheet.getLastRow();
      let rowNumber = 0;
      if (key && lastRow >= 2) {
        const ids = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
        const index = ids.findIndex(function(row) { return row[0] === key || row[1] === key; });
        if (index >= 0) rowNumber = index + 2;
      }
      const row = rowNumber ? sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0] : [];
      const photo = String(row[HEADERS.indexOf("photo")] || "");
      return output_({ ok: true, found: !!rowNumber, recordId:String(row[0] || ""),
        studentCode:String(row[1] || ""), className:String(row[HEADERS.indexOf("className")] || ""),
        updatedAt:String(row[HEADERS.indexOf("updatedAt")] || ""),
        hasPhoto: !!photo.trim(), photoLength: photoStoredSourceLength_(photo),
        photoStorage: photoStorageKind_(photo) }, e);
    }
    if (action === "list") {
      ensureMissingStudentCodes_();
      return output_({
        ok: true,
        students: readStudents_(),
        settings: readAppSettings_(),
        revision: getRevision_(DATA_REVISION_PROPERTY),
        settingsRevision: getRevision_(SETTINGS_REVISION_PROPERTY)
      }, e);
    }
    if (action === "listpage") {
      const requestedOffset = Number((e && e.parameter && e.parameter.offset) || 0);
      if (!Number.isFinite(requestedOffset) || requestedOffset <= 0) ensureMissingStudentCodes_();
      const sheet = getStudentsSheet_();
      const total = Math.max(0, sheet.getLastRow() - 1);
      const offset = Number.isFinite(requestedOffset) ? Math.min(total, Math.max(0, Math.floor(requestedOffset))) : 0;
      // Phone connections are much more reliable when the initial list contains
      // text only. Photos are returned later for students visible on screen.
      const includePhotos = String((e && e.parameter && e.parameter.includePhotos) || "1") !== "0";
      const requestedLimit = Number((e && e.parameter && e.parameter.limit) || 64);
      const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 64;
      const rowCount = Math.min(limit, total - offset);
      const photoIndex = HEADERS.indexOf("photo");
      let rows = [];
      if (rowCount) {
        if (includePhotos) {
          rows = sheet.getRange(offset + 2, 1, rowCount, HEADERS.length).getValues();
        } else {
          const left = sheet.getRange(offset + 2, 1, rowCount, photoIndex).getValues();
          const right = sheet.getRange(offset + 2, photoIndex + 2, rowCount, HEADERS.length - photoIndex - 1).getValues();
          rows = left.map(function(row, index) { return row.concat([""], right[index]); });
        }
      }
      const students = rows
          .filter(function(row) { return row.some(function(cell) { return String(cell || "").trim() !== ""; }); })
          .map(rowToStudent_);
      return output_({
        ok: true,
        students: students,
        offset: offset,
        limit: limit,
        total: total,
        settings: offset === 0 ? readAppSettings_() : undefined,
        revision: getRevision_(DATA_REVISION_PROPERTY),
        settingsRevision: getRevision_(SETTINGS_REVISION_PROPERTY)
      }, e);
    }
    if (action === "photos") {
      // Fetch only explicitly requested photos. This prevents a few large Base64
      // images from stopping the full student list on a phone connection.
      const requestedKeys = String((e && e.parameter && (e.parameter.studentIds || e.parameter.ids)) || "")
        .split(",").map(function(value) { return String(value || "").trim(); }).filter(Boolean).slice(0, 24);
      if (!requestedKeys.length) return output_({ ok:true, students:[] }, e);
      const requested = {};
      requestedKeys.forEach(function(key) { requested[key] = true; });
      const sheet = getStudentsSheet_();
      const count = Math.max(0, sheet.getLastRow() - 1);
      const idAndCodes = count ? sheet.getRange(2, 1, count, 2).getDisplayValues() : [];
      const photoColumn = HEADERS.indexOf("photo") + 1;
      const students = idAndCodes.map(function(row, index) {
        const id = String(row[0] || "").trim();
        const studentCode = String(row[1] || "").trim();
        if (!requested[id] && !requested[studentCode]) return null;
        return { id:id, studentCode:studentCode, rowNumber:index + 2 };
      }).filter(Boolean).map(function(student) {
        return {
          id:student.id,
          studentCode:student.studentCode,
          photo:photoForClient_(sheet.getRange(student.rowNumber, photoColumn).getValue())
        };
      }).filter(Boolean);
      return output_({ ok:true, students:students, revision:getRevision_(DATA_REVISION_PROPERTY) }, e);
    }
    if (action === "identities") {
      ensureMissingStudentCodes_();
      const sheet = getStudentsSheet_();
      const count = Math.max(0, sheet.getLastRow() - 1);
      const left = count ? sheet.getRange(2, 1, count, 3).getDisplayValues() : [];
      const names = count ? sheet.getRange(2, HEADERS.indexOf("studentSurname") + 1, count, 2).getDisplayValues() : [];
      const students = left.map(function(row, index) {
        return {
          id: row[0], studentCode: row[1], studentName: row[2],
          studentSurname: names[index][0], studentGivenName: names[index][1]
        };
      }).filter(function(student) { return student.id || student.studentCode || student.studentName; });
      return output_({ ok:true, students:students, revision:getRevision_(DATA_REVISION_PROPERTY) }, e);
    }
    if (action === "photostorage") {
      return output_(photoStorageStatus_(), e);
    }
    if (action === "setup" || action === "design" || action === "format") {
      const count = withWriteLock_(function() {
        const students = readStudents_();
        refreshWorkbookDesign_(students);
        touchRevision_(DATA_REVISION_PROPERTY);
        return students.length;
      });
      return output_({ ok: true, action: action, count: count }, e);
    }
    if (action === "exportportal") {
      // Read-only, admin-only export of the portal tabs for the move to Neon.
      // Credentials leave only as salted hashes; nothing is changed.
      const tab = function(name, headers) {
        const sheet = portalSheet_(name, headers, false);
        if (!sheet || sheet.getLastRow() < 2) return [];
        return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues()
          .filter(function(row) { return String(row[0] || row[1] || "").trim(); })
          .map(function(row) { const item = {}; headers.forEach(function(key, i) { item[key] = row[i]; }); return item; });
      };
      return output_({ ok: true, action: action,
        access: tab(PORTAL_ACCESS_SHEET, PORTAL_ACCESS_HEADERS),
        attendance: tab(PORTAL_ATTENDANCE_SHEET, PORTAL_ATTENDANCE_HEADERS),
        scores: tab(PORTAL_SCORES_SHEET, PORTAL_SCORE_HEADERS),
        activities: tab(PORTAL_ACTIVITIES_SHEET, PORTAL_ACTIVITY_HEADERS),
        revision: getRevision_(DATA_REVISION_PROPERTY) }, e);
    }
    return output_({ ok: false, error: "Unknown action" }, e);
  } catch (err) {
    return output_({ ok: false, error: String((err && err.message) || err) }, e);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    assertAuthorized_(e, body);
    const action = String(body.action || "").toLowerCase();
    if (action === "backup") {
      const rows = Array.isArray(body.students) ? body.students : [];
      const count = withWriteLock_(function() {
        const mergedCount = mergeStudents_(rows.map(normalizeIncomingStudent_));
        touchRevision_(DATA_REVISION_PROPERTY);
        return mergedCount;
      });
      return output_({ ok: true, action: action, mode: "merge", count: count }, e);
    }
    if (action === "replace") {
      const rows = Array.isArray(body.students) ? body.students : [];
      withWriteLock_(function() {
        replaceStudents_(rows.map(normalizeIncomingStudent_));
        touchRevision_(DATA_REVISION_PROPERTY);
      });
      return output_({ ok: true, action: action, mode: "replace", count: rows.length }, e);
    }
    if (action === "upsert") {
      const student = normalizeIncomingStudent_(body);
      withWriteLock_(function() {
        upsertStudent_(student);
        touchRevision_(DATA_REVISION_PROPERTY);
      });
      return output_({ ok: true, action: action, studentId: student.studentCode || student.id }, e);
    }
    if (action === "upsertmany") {
      const rows = Array.isArray(body.students) ? body.students : [];
      const count = withWriteLock_(function() {
        const mergedCount = mergeStudents_(rows.map(normalizeIncomingStudent_));
        touchRevision_(DATA_REVISION_PROPERTY);
        return mergedCount;
      });
      return output_({ ok: true, action: action, mode: "merge", count: count }, e);
    }
    if (action === "recoverphotos") {
      const candidates = Array.isArray(body.students) ? body.students : [];
      const result = withWriteLock_(function() {
        const restored = restoreMissingPhotos_(candidates);
        if (restored) touchRevision_(DATA_REVISION_PROPERTY);
        return restored;
      });
      return output_({ ok: true, action: action, restored: result }, e);
    }
    if (action === "migratephotos") {
      const result = withWriteLock_(function() {
        const migrated = migratePhotoBatch_(body.cursor, body.limit);
        if (migrated.migrated) touchRevision_(DATA_REVISION_PROPERTY);
        return migrated;
      });
      return output_(Object.assign({ ok:true, action:action }, result), e);
    }
    if (action === "delete") {
      const deleted = withWriteLock_(function() {
        const result = deleteStudent_({
          recordId:body.student && (body.student.recordId || body.student.id) || body.studentId,
          studentCode:body.student && body.student.studentCode
        });
        if (result) touchRevision_(DATA_REVISION_PROPERTY);
        return result;
      });
      return output_({ ok: true, action: action, deleted:deleted }, e);
    }
    if (action === "moveclass") {
      const result = withWriteLock_(function() {
        const moved = moveStudentClass_(body.studentId, body.student || {});
        if (moved.changed) touchRevision_(DATA_REVISION_PROPERTY);
        return moved;
      });
      return output_(Object.assign({ ok:true, action:action }, result), e);
    }
    if (action === "settings") {
      const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
      withWriteLock_(function() {
        writeAppSettings_(settings);
        touchRevision_(SETTINGS_REVISION_PROPERTY);
      });
      return output_({ ok: true, action: action }, e);
    }
    if (action === "setup" || action === "design" || action === "format") {
      const count = withWriteLock_(function() {
        const students = readStudents_();
        refreshWorkbookDesign_(students);
        return students.length;
      });
      return output_({ ok: true, action: action, count: count }, e);
    }
    return output_({ ok: false, error: "Unknown action" }, e);
  } catch (err) {
    return output_({ ok: false, error: String((err && err.message) || err) }, e);
  }
}

function output_(payload, e) {
  const callback = e && e.parameter && e.parameter.callback;
  const json = JSON.stringify(payload);
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function assertAuthorized_(e, body) {
  const queryKey = e && e.parameter ? e.parameter.key : "";
  const supplied = String((body && body.accessKey) || queryKey || "").trim();
  const admin = portalAdminCredential_();
  if (admin) {
    if (!portalPinMatches_(admin, supplied)) throw new Error("Unauthorized: admin access key is missing or incorrect");
    return;
  }
  if (PropertiesService.getScriptProperties().getProperty(PORTAL_ADMIN_REQUIRED_PROPERTY) === "1") {
    throw new Error("Unauthorized: admin credential is unavailable; contact the school administrator");
  }
  const expected = String(PropertiesService.getScriptProperties().getProperty(ACCESS_KEY_PROPERTY) || "").trim();
  if (!expected) return;
  if (supplied !== expected) throw new Error("Unauthorized: access key is missing or incorrect");
}

function withWriteLock_(work) {
  const lock = LockService.getScriptLock();
  lock.waitLock(WRITE_LOCK_TIMEOUT_MS);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

function getRevision_(propertyName) {
  return String(PropertiesService.getScriptProperties().getProperty(propertyName) || "0");
}

function touchRevision_(propertyName) {
  const revision = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(propertyName, revision);
  return revision;
}

function photoDriveFileId_(value) {
  const text = String(value || "").trim();
  if (text.indexOf(PHOTO_REFERENCE_PREFIX) === 0) {
    const id = text.slice(PHOTO_REFERENCE_PREFIX.length).trim();
    return /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : "";
  }
  const driveUrl = text.match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{10,})/);
  return driveUrl ? driveUrl[1] : "";
}

function photoStorageKind_(value) {
  const text = String(value || "").trim();
  if (!text) return "missing";
  if (photoDriveFileId_(text)) return "drive";
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(text)) return "sheet";
  if (/^https:\/\//i.test(text)) return "url";
  return "unknown";
}

function photoStoredSourceLength_(value) {
  const text = String(value || "").trim();
  const fileId = photoDriveFileId_(text);
  if (!fileId) return text.length;
  try {
    const details = JSON.parse(String(DriveApp.getFileById(fileId).getDescription() || "{}"));
    const length = Number(details.sourceLength);
    return Number.isFinite(length) && length > 0 ? length : text.length;
  } catch (err) {
    return text.length;
  }
}

function photoFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = String(properties.getProperty(PHOTO_FOLDER_PROPERTY) || "").trim();
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); }
    catch (err) { console.warn("Saved student photo folder is unavailable; creating a replacement", err); }
  }
  const folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  try { folder.setDescription("Private student photos managed by the Student Registration Apps Script. Do not make this folder public."); }
  catch (err) { console.warn("Cannot label the student photo folder", err); }
  properties.setProperty(PHOTO_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function photoFileName_(student, mime) {
  const extension = /png/i.test(mime) ? ".png" : /webp/i.test(mime) ? ".webp" : ".jpg";
  const identity = String((student && (student.studentCode || student.id || student.studentName)) || "student")
    .replace(/[\\\/:*?"<>|\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ").trim().slice(0, 80) || "student";
  const stamp = Utilities.formatDate(new Date(), "Asia/Phnom_Penh", "yyyyMMdd-HHmmss");
  return identity + "-" + stamp + "-" + Utilities.getUuid().slice(0, 8) + extension;
}

function savePhotoToDrive_(value, student) {
  const text = String(value || "").trim();
  if (!text || photoDriveFileId_(text)) return text;
  const match = text.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return text;
  const subtype = match[1].toLowerCase();
  const mime = subtype === "png" ? "image/png" : subtype === "webp" ? "image/webp" : "image/jpeg";
  const bytes = Utilities.base64Decode(match[2].replace(/\s+/g, ""));
  if (!bytes.length) throw new Error("Student photo is empty");
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Student photo exceeds the 5 MB Drive limit");
  const name = photoFileName_(student, mime);
  const file = photoFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  try {
    file.setDescription(JSON.stringify({
      recordId:String((student && student.id) || ""),
      studentCode:String((student && student.studentCode) || ""),
      studentName:String((student && student.studentName) || ""),
      sourceLength:text.length,
      savedAt:new Date().toISOString()
    }));
  } catch (err) { console.warn("Cannot label student photo " + file.getId(), err); }
  // Files remain private. The web app receives image bytes only through this
  // access-key-protected Apps Script, never through a public Drive share link.
  return PHOTO_REFERENCE_PREFIX + file.getId();
}

function photoForClient_(value) {
  const text = String(value || "").trim();
  const fileId = photoDriveFileId_(text);
  if (!fileId) return /^(?:data:image\/(?:png|jpe?g|webp);base64,|https:\/\/)/i.test(text) ? text : "";
  try {
    const blob = DriveApp.getFileById(fileId).getBlob();
    const mime = String(blob.getContentType() || "image/jpeg").toLowerCase();
    if (!/^image\/(?:png|jpe?g|webp)$/.test(mime)) return "";
    return "data:" + mime + ";base64," + Utilities.base64Encode(blob.getBytes());
  } catch (err) {
    console.error("Cannot read student photo " + fileId, err);
    return "";
  }
}

function photoStorageStatus_() {
  const sheet = getStudentsSheet_();
  const total = Math.max(0, sheet.getLastRow() - 1);
  const values = total ? sheet.getRange(2, HEADERS.indexOf("photo") + 1, total, 1).getDisplayValues() : [];
  const counts = { drive:0, sheet:0, url:0, missing:0, unknown:0 };
  values.forEach(function(row) { counts[photoStorageKind_(row[0])]++; });
  return {
    ok:true,
    total:total,
    drive:counts.drive,
    legacy:counts.sheet + counts.url,
    embedded:counts.sheet,
    url:counts.url,
    missing:counts.missing,
    unknown:counts.unknown,
    nextCursor:2,
    revision:getRevision_(DATA_REVISION_PROPERTY)
  };
}

function migratePhotoBatch_(cursor, requestedLimit) {
  const sheet = getStudentsSheet_();
  const lastRow = sheet.getLastRow();
  const start = Math.min(Math.max(2, Math.floor(Number(cursor) || 2)), Math.max(2, lastRow + 1));
  const limit = Math.min(PHOTO_MIGRATION_BATCH_LIMIT, Math.max(1, Math.floor(Number(requestedLimit) || 6)));
  const end = Math.min(lastRow, start + limit - 1);
  let migrated = 0;
  let failed = 0;
  if (start <= end) {
    const rows = sheet.getRange(start, 1, end - start + 1, HEADERS.length).getValues();
    rows.forEach(function(row, index) {
      const student = rowToStudent_(row);
      if (photoStorageKind_(student.photo) !== "sheet") return;
      try {
        const reference = savePhotoToDrive_(student.photo, student);
        if (!photoDriveFileId_(reference)) throw new Error("Drive did not return a valid photo reference");
        // Replace the Sheet cell only after Drive confirms the new file.
        sheet.getRange(start + index, HEADERS.indexOf("photo") + 1).setValue(reference);
        migrated++;
      } catch (err) {
        failed++;
        console.error("Photo migration failed for row " + (start + index), err);
      }
    });
  }
  return { cursor:start, nextCursor:end + 1, scanned:Math.max(0, end - start + 1), migrated:migrated,
    failed:failed, done:end >= lastRow || start > lastRow, total:Math.max(0, lastRow - 1) };
}

function getSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  const created = !sheet;
  if (created) sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
  const header = sheet.getRange(1, 1, 1, 2).getDisplayValues()[0];
  if (created || header[0] !== "key" || header[1] !== "value") {
    sheet.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#d9f3ef");
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 420);
    try { sheet.hideSheet(); } catch (err) {}
  }
  return sheet;
}

function readAppSettings_() {
  const sheet = getSettingsSheet_();
  const settings = { issueDate: "", principalName: "", studentCodePrefix: "STU", studentCodeDigits: 4,
    academicYearStart: Number(Utilities.formatDate(new Date(), "Asia/Phnom_Penh", "yyyy")), classTeachers: {} };
  if (sheet.getLastRow() < 2) return settings;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  values.forEach(function(row) {
    const key = String(row[0] || "").trim();
    if (["issueDate", "cardLunarDate", "principalName", "principalPhone", "ictPhone", "studentCodePrefix"].indexOf(key) !== -1) settings[key] = String(row[1] || "").trim();
    if (key === "studentCodeDigits") settings.studentCodeDigits = Number(row[1]) || 4;
    if (key === "academicYearStart") settings.academicYearStart = Number(row[1]) || settings.academicYearStart;
    if (key === "classTeachers") {
      try {
        const parsed = JSON.parse(row[1] || "{}");
        settings.classTeachers = parsed && typeof parsed === "object" ? parsed : {};
      } catch (err) {
        settings.classTeachers = {};
      }
    }
  });
  return settings;
}

function writeAppSettings_(settings) {
  const sheet = getSettingsSheet_();
  const safeTeachers = settings.classTeachers && typeof settings.classTeachers === "object" ? settings.classTeachers : {};
  const requestedYear = Number(settings.academicYearStart);
  const academicYear = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2099
    ? requestedYear : readAppSettings_().academicYearStart;
  const rows = [
    ["issueDate", String(settings.issueDate || "").trim()],
    ["principalName", String(settings.principalName || "").trim()],
    ["principalPhone", String(settings.principalPhone || "").trim()],
    ["cardLunarDate", String(settings.cardLunarDate || "").trim()],
    ["ictPhone", String(settings.ictPhone || "").trim()],
    ["studentCodePrefix", String(settings.studentCodePrefix || "STU").trim()],
    ["studentCodeDigits", Math.min(8, Math.max(2, Number(settings.studentCodeDigits) || 4))],
    ["academicYearStart", academicYear],
    ["classTeachers", JSON.stringify(safeTeachers)]
  ];
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

function getStudentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  const created = !sheet;
  if (created) sheet = ss.insertSheet(SHEET_NAME, 0);
  ensureColumns_(sheet, HEADERS.length);

  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  const hasHeader = firstRow.some(function(value) { return String(value || "").trim() !== ""; });
  const isTechnicalHeader = HEADERS.every(function(key, i) { return firstRow[i] === key; });
  const isDesignedHeader = HEADER_ROW.every(function(label, i) { return firstRow[i] === label; });
  if (!hasHeader || isTechnicalHeader || !isDesignedHeader) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADER_ROW]);
    formatStudentsSheet_(sheet);
  }
  return sheet;
}

function readStudents_() {
  const sheet = getStudentsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter(function(row) {
      return row.some(function(cell) { return String(cell || "").trim() !== ""; });
    })
    .map(rowToStudent_);
}

function ensureMissingStudentCodes_() {
  const count = withWriteLock_(function() {
    const sheet = getStudentsSheet_();
    return assignMissingStudentCodes_(sheet, 2, sheet.getLastRow());
  });
  if (count) touchRevision_(DATA_REVISION_PROPERTY);
  return count;
}

function assignMissingStudentCodes_(sheet, firstRow, lastRow) {
  const sheetLastRow = sheet.getLastRow();
  const rowCount = Math.max(0, sheetLastRow - 1);
  if (!rowCount) return 0;
  const start = Math.max(2, Number(firstRow) || 2);
  const end = Math.min(sheetLastRow, Number(lastRow) || sheetLastRow);
  if (end < start) return 0;

  // Read only identity, names and timestamps. Never load photo cells just to
  // assign IDs; those cells can contain large embedded images.
  const identities = sheet.getRange(2, 1, rowCount, 6).getDisplayValues();
  const splitNames = sheet.getRange(2, HEADERS.indexOf("studentSurname") + 1, rowCount, 2).getDisplayValues();
  const timestamps = sheet.getRange(2, HEADERS.indexOf("createdAt") + 1, rowCount, 2).getValues();
  const usedCodes = identities.map(function(row) { return String(row[1] || "").trim(); }).filter(Boolean);
  const usedSet = new Set(usedCodes);
  const academicYear = studentCodeAcademicYear_();
  const updates = [];

  for (let rowNumber = start; rowNumber <= end; rowNumber++) {
    const index = rowNumber - 2;
    const identity = identities[index] || [];
    if (String(identity[1] || "").trim()) continue;
    const name = String(identity[2] || [splitNames[index] && splitNames[index][0], splitNames[index] && splitNames[index][1]].filter(Boolean).join(" ")).trim();
    const className = String(identity[5] || "").trim();
    if (!name || !studentCodeGrade_(className)) continue;

    const studentCode = allocateStudentCode_(className, "", Array.from(usedSet), academicYear);
    if (!studentCode) continue;
    usedSet.add(studentCode);
    const timestamp = new Date().toISOString();
    const savedTimestamps = timestamps[index] || [];
    updates.push({
      rowNumber:rowNumber,
      identity:[String(identity[0] || Utilities.getUuid()), studentCode],
      timestamps:[savedTimestamps[0] || timestamp, timestamp]
    });
  }

  // Write adjacent records together for large paste operations.
  for (let i = 0; i < updates.length;) {
    let next = i + 1;
    while (next < updates.length && updates[next].rowNumber === updates[next - 1].rowNumber + 1) next++;
    const group = updates.slice(i, next);
    const first = group[0].rowNumber;
    sheet.getRange(first, 1, group.length, 2).setValues(group.map(function(item) { return item.identity; }));
    sheet.getRange(first, HEADERS.indexOf("createdAt") + 1, group.length, 2)
      .setValues(group.map(function(item) { return item.timestamps; }));
    i = next;
  }
  return updates.length;
}

function rowToStudent_(row) {
  const student = {};
  HEADERS.forEach(function(key, i) {
    student[key] = row[i] instanceof Date
      ? Utilities.formatDate(row[i], Session.getScriptTimeZone(), "yyyy-MM-dd")
      : row[i];
  });
  if (!student.studentName) {
    student.studentName = [student.studentSurname, student.studentGivenName].filter(Boolean).join(" ");
  }
  if (!student.studentSurname && !student.studentGivenName && student.studentName) {
    const parts = String(student.studentName).trim().split(/\s+/).filter(Boolean);
    student.studentSurname = parts.shift() || "";
    student.studentGivenName = parts.join(" ");
  }
  return student;
}

function replaceStudents_(students) {
  // A nonempty replacement is an import, not a request to erase existing photos.
  if (!students.length) return writeStudents_([]);
  const oldByKey = {};
  readStudents_().forEach(function(student) {
    [student.id, student.studentCode].filter(Boolean).forEach(function(key) { oldByKey[String(key).trim()] = student; });
  });
  writeStudents_(students.map(function(student) {
    const previous = oldByKey[String(student.id || "").trim()] || oldByKey[String(student.studentCode || "").trim()];
    if (!previous) {
      student.photo = savePhotoToDrive_(student.photo, student);
      return student;
    }
    student.photo = photoForStoredRecord_(student, previous);
    const merged = mergeStudentRecord_(previous, student);
    merged.studentCode = previous.studentCode;
    return merged;
  }));
}

function mergeStudents_(incomingStudents) {
  const sheet = getStudentsSheet_();
  assignMissingStudentCodes_(sheet, 2, sheet.getLastRow());
  const students = readStudents_();
  incomingStudents.forEach(function(incoming) {
    const student = normalizeIncomingStudent_(incoming);
    const key = String(student.id || student.studentCode || "").trim();
    const keyIndex = students.findIndex(function(existing) {
      return studentMatchesKey_(existing, key);
    });
    if (keyIndex >= 0) {
      const createdAt = students[keyIndex].createdAt;
      const assignedCode = students[keyIndex].studentCode;
      student.photo = photoForStoredRecord_(student, students[keyIndex]);
      students[keyIndex] = mergeStudentRecord_(students[keyIndex], student);
      students[keyIndex].studentCode = assignedCode;
      if (createdAt) students[keyIndex].createdAt = createdAt;
      return;
    }
    // A different record with the same normalized Khmer name is a duplicate.
    if (students.some(function(existing) { return sameStudentName_(existing, student); })) return;
    student.photo = savePhotoToDrive_(student.photo, student);
    students.push(student);
  });
  writeStudents_(students);
  return incomingStudents.length;
}

function upsertStudent_(student) {
  const key = String(student.id || student.studentCode || "").trim();
  if (!key) throw new Error("Student record ID is required");
  const sheet = getStudentsSheet_();
  assignMissingStudentCodes_(sheet, 2, sheet.getLastRow());
  const lastRow = sheet.getLastRow();
  const identityRows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues() : [];
  const matchingIndex = identityRows.findIndex(function(row) { return row[0] === key; });
  const academicYear = studentCodeAcademicYear_();
  if (lastRow >= 2) {
    const count = lastRow - 1;
    if (matchingIndex >= 0) {
        const existing = rowToStudent_(sheet.getRange(matchingIndex + 2, 1, 1, HEADERS.length).getValues()[0]);
        student.photo = photoForStoredRecord_(student, existing);
        const merged = mergeStudentRecord_(existing, student);
        merged.studentCode = allocateStudentCode_(merged.className, existing.studentCode,
          identityRows.filter(function(_row, index) { return index !== matchingIndex; }).map(function(row) { return row[1]; }), academicYear);
        merged.createdAt = existing.createdAt || student.createdAt;
        sheet.getRange(matchingIndex + 2, 1, 1, HEADERS.length).setValues([studentToRow_(merged)]);
        student.studentCode = merged.studentCode;
        return;
    }
    const splitNames = sheet.getRange(2, HEADERS.indexOf("studentSurname") + 1, count, 2).getDisplayValues();
    for (let i = 0; i < identityRows.length; i++) {
      if (sameStudentName_({
        studentName:identityRows[i][2],
        studentSurname:splitNames[i][0],
        studentGivenName:splitNames[i][1]
      }, student)) return;
    }
  }
  student.photo = savePhotoToDrive_(student.photo, student);
  student.studentCode = allocateStudentCode_(student.className, "", identityRows.map(function(row) { return row[1]; }), academicYear);
  ensureRows_(sheet, Math.max(2, lastRow + 1));
  sheet.getRange(Math.max(2, lastRow + 1), 1, 1, HEADERS.length).setValues([studentToRow_(student)]);
}

function studentCodeAcademicYear_() {
  const year = Number(readAppSettings_().academicYearStart);
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("Academic year must be 2000–2099");
  return year;
}

function studentCodeGrade_(className) {
  const text = String(className || "").replace(/[០-៩]/g, function(digit) { return String(digit.charCodeAt(0) - 0x17E0); })
    .replace(/^\s*(?:ថ្នាក់ទី|ថ្នាក់|ទី)\s*/, "").trim();
  const match = text.match(/^(1[0-2]|[7-9])(?=\D|$)/);
  return match ? Number(match[1]) : null;
}

function studentCodeStem_(className, academicYear) {
  const grade = studentCodeGrade_(className);
  if (!grade) return "";
  return STUDENT_SCHOOL_CODE + String((academicYear - (grade - 7)) % 100).padStart(2, "0")
    + String(grade).padStart(2, "0");
}

function allocateStudentCode_(className, previousCode, otherCodes, academicYear) {
  const stem = studentCodeStem_(className, academicYear);
  const previous = String(previousCode || "").trim();
  if (!stem) return previous;
  const used = new Set((otherCodes || []).map(function(code) { return String(code || "").trim(); }));
  if (previous.startsWith(stem) && /^\d{3}$/.test(previous.slice(stem.length)) && !used.has(previous)) return previous;
  let maximum = 0;
  used.forEach(function(code) {
    if (code.startsWith(stem) && /^\d{3}$/.test(code.slice(stem.length))) {
      maximum = Math.max(maximum, Number(code.slice(stem.length)));
    }
  });
  if (maximum >= 999) throw new Error("Student code sequence is full for " + stem);
  return stem + String(maximum + 1).padStart(3, "0");
}

function normalizeStudentCodes_(students) {
  const academicYear = studentCodeAcademicYear_();
  const used = new Set();
  (students || []).forEach(function(student) {
    const code = String(student.studentCode || "").trim();
    const stem = studentCodeStem_(student.className, academicYear);
    if ((!stem || (code.startsWith(stem) && /^\d{3}$/.test(code.slice(stem.length)))) && code && !used.has(code)) {
      used.add(code);
    } else if (stem) {
      student.studentCode = "";
    }
  });
  (students || []).forEach(function(student) {
    if (!studentCodeStem_(student.className, academicYear) || student.studentCode) return;
    student.studentCode = allocateStudentCode_(student.className, "", [...used], academicYear);
    used.add(student.studentCode);
  });
  return students;
}

function mergeStudentRecord_(existing, incoming) {
  const merged = Object.assign({}, existing || {}, incoming || {});
  if (incoming && incoming.__hasStudentLatinName === false) {
    merged.studentLatinName = String((existing && existing.studentLatinName) || "");
  }
  // Never let a text-only edit or an offline retry with no cached image clear a photo
  // that already exists in the shared Sheet.
  ["studentName", "studentSurname", "studentGivenName", "photo", "classTrack"].forEach(function(field) {
    if (!String((incoming && incoming[field]) || "").trim() && String((existing && existing[field]) || "").trim()) {
      merged[field] = existing[field];
    }
  });
  if (!String(merged.studentName || "").trim()) {
    merged.studentName = [merged.studentSurname, merged.studentGivenName].filter(Boolean).join(" ");
  }
  return merged;
}

function photoForStoredRecord_(incoming, existing) {
  const next = String((incoming && incoming.photo) || "").trim();
  const previous = String((existing && existing.photo) || "").trim();
  if (!next) return previous;
  // An opaque no-cors reply can make the client retry the same mutation. If
  // this exact update already reached the Sheet, reuse its Drive file.
  if (photoDriveFileId_(previous) && String((incoming && incoming.updatedAt) || "")
      && String(incoming.updatedAt) === String((existing && existing.updatedAt) || "")) return previous;
  // Bulk backups often contain a hydrated copy of a photo already stored in
  // Drive. Do not create duplicates unless the edit form explicitly selected
  // a replacement portrait.
  if (photoDriveFileId_(previous) && !(incoming && incoming.__photoChanged === true)) return previous;
  return savePhotoToDrive_(next, incoming);
}

function restoreMissingPhotos_(incomingStudents) {
  const sheet = getStudentsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const missing = rows.map(function(row, index) {
    return { student: rowToStudent_(row), rowNumber: index + 2 };
  }).filter(function(item) {
    return !String(item.student.photo || "").trim() && String(item.student.studentCode || "").trim();
  });
  if (!missing.length) return 0;

  const candidates = {};
  function addCandidate(student) {
    const code = String(student.studentCode || "").trim();
    const photo = String(student.photo || "").trim();
    if (!code || (!photoDriveFileId_(photo) && !/^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(photo))) return;
    if (!candidates[code]) candidates[code] = [];
    candidates[code].push({ name: studentNameKey_(student), photo: photo });
  }
  (incomingStudents || []).forEach(function(item) {
    addCandidate(item && item.student ? item.student : item || {});
  });

  // Class views may still contain a photo from before the Students row went blank.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  (incomingStudents.length ? [] : ss.getSheets()).filter(function(view) {
    return view.getName() === BY_CLASS_SHEET_NAME || view.getName().indexOf(CLASS_SHEET_PREFIX) === 0;
  }).forEach(function(view) {
    if (view.getLastRow() < 2) return;
    const values = view.getRange(2, 1, view.getLastRow() - 1, VIEW_FIELDS.length).getValues();
    values.forEach(function(row) {
      const student = {};
      VIEW_FIELDS.forEach(function(field, index) { student[field] = row[index]; });
      addCandidate(student);
    });
  });

  let restored = 0;
  missing.forEach(function(item) {
    const code = String(item.student.studentCode || "").trim();
    const name = studentNameKey_(item.student);
    const matches = (candidates[code] || []).filter(function(candidate) {
      return !name || !candidate.name || candidate.name === name;
    });
    if (!matches.length) return;
    const uniquePhotos = Array.from(new Set(matches.map(function(candidate) { return candidate.photo; })));
    // Conflicting photos require human review; never guess which student photo is right.
    if (uniquePhotos.length !== 1) return;
    const reference = savePhotoToDrive_(uniquePhotos[0], item.student);
    sheet.getRange(item.rowNumber, HEADERS.indexOf("photo") + 1).setValue(reference);
    restored++;
  });
  return restored;
}

function deleteStudent_(identity) {
  const request = identity && typeof identity === "object" ? identity : { recordId:identity };
  const recordId = String(request.recordId || "").trim();
  const code = String(request.studentCode || "").trim();
  if (!recordId && !code) throw new Error("Student record ID is required for deletion");
  const sheet = getStudentsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  const idMatches = recordId ? rows.map(function(row, index) { return String(row[0] || "").trim() === recordId ? index : -1; }).filter(function(index) { return index >= 0; }) : [];
  if (idMatches.length > 1) throw new Error("Duplicate record IDs; deletion needs review");
  let index = idMatches.length ? idMatches[0] : -1;
  if (index < 0 && code) {
    const codeMatches = rows.map(function(row, rowIndex) { return String(row[1] || "").trim() === code ? rowIndex : -1; }).filter(function(rowIndex) { return rowIndex >= 0; });
    if (codeMatches.length > 1) throw new Error("Duplicate student codes; deletion needs review");
    if (codeMatches.length) {
      const candidate = codeMatches[0];
      const candidateId = String(rows[candidate][0] || "").trim();
      if (recordId && candidateId && candidateId !== recordId && candidateId !== code) {
        throw new Error("Record ID mismatch; deletion needs review");
      }
      index = candidate;
    }
  }
  if (index < 0) return false;
  sheet.deleteRow(index + 2);
  return true;
}

function moveStudentClass_(recordId, change) {
  const id = String(recordId || change.recordId || change.id || "").trim();
  const className = String(change.className || "").trim();
  if (!id) throw new Error("Student record ID is required for class transfer");
  if (!studentCodeGrade_(className)) throw new Error("Class must be grade 7–12");
  const sheet = getStudentsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("Student record not found");
  const identities = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  const matches = identities.map(function(row, index) { return String(row[0] || "").trim() === id ? index : -1; }).filter(function(index) { return index >= 0; });
  if (matches.length !== 1) throw new Error(matches.length ? "Duplicate record IDs" : "Student record not found");
  const index = matches[0];
  const rowNumber = index + 2;
  const oldClass = String(sheet.getRange(rowNumber, HEADERS.indexOf("className") + 1).getDisplayValue() || "").trim();
  const oldCode = String(identities[index][1] || "").trim();
  if (oldClass === className) return { changed:false, recordId:id, className:className, studentCode:oldCode };
  const code = allocateStudentCode_(className, oldCode, identities.filter(function(_row, rowIndex) { return rowIndex !== index; }).map(function(row) { return row[1]; }), studentCodeAcademicYear_());
  const updatedAt = String(change.updatedAt || new Date().toISOString());
  sheet.getRange(rowNumber, HEADERS.indexOf("className") + 1).setValue(className);
  sheet.getRange(rowNumber, HEADERS.indexOf("studentCode") + 1).setValue(code);
  sheet.getRange(rowNumber, HEADERS.indexOf("updatedAt") + 1).setValue(updatedAt);
  return { changed:true, recordId:id, className:className, studentCode:code, updatedAt:updatedAt };
}

function writeStudents_(students) {
  const sheet = getStudentsSheet_();
  const sorted = sortStudents_(normalizeStudentCodes_(dedupeStudentsByName_(students.map(normalizeIncomingStudent_))));
  ensureRows_(sheet, Math.max(2, sorted.length + 1));
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
  }
  if (sorted.length) {
    sheet.getRange(2, 1, sorted.length, HEADERS.length).setValues(sorted.map(studentToRow_));
  }
  formatStudentsSheet_(sheet);
  refreshWorkbookDesign_(sorted);
}

function normalizeIncomingStudent_(item) {
  item = item || {};
  const student = item.student && typeof item.student === "object" ? item.student : item;
  const now = new Date().toISOString();
  const normalized = {};
  HEADERS.forEach(function(key) { normalized[key] = cell_(student[key]); });
  // A backup/import can normalize the same row more than once. Keep the original
  // field-presence flag so older clients cannot erase a Latin name accidentally.
  normalized.__hasStudentLatinName = Object.prototype.hasOwnProperty.call(student, "__hasStudentLatinName")
    ? student.__hasStudentLatinName === true
    : Object.prototype.hasOwnProperty.call(student, "studentLatinName");
  normalized.__photoChanged = student.__photoChanged === true || student.photoChanged === true;
  normalized.id = cell_(student.recordId || student.id || student.studentCode || item.studentId);
  normalized.studentCode = cell_(student.studentCode || item.studentId || student.studentId);
  normalized.studentSurname = cell_(student.studentSurname);
  normalized.studentGivenName = cell_(student.studentGivenName);
  normalized.studentName = cell_(student.studentName || [normalized.studentSurname, normalized.studentGivenName].filter(Boolean).join(" "));
  if ((!normalized.studentSurname || !normalized.studentGivenName) && normalized.studentName) {
    const parts = String(normalized.studentName).trim().split(/\s+/).filter(Boolean);
    if (!normalized.studentSurname && normalized.studentGivenName && normalized.studentName.endsWith(normalized.studentGivenName)) {
      normalized.studentSurname = normalized.studentName.slice(0, -normalized.studentGivenName.length).trim();
    }
    if (!normalized.studentGivenName && normalized.studentSurname && normalized.studentName.indexOf(normalized.studentSurname) === 0) {
      normalized.studentGivenName = normalized.studentName.slice(normalized.studentSurname.length).trim();
    }
    if (!normalized.studentSurname) normalized.studentSurname = parts[0] || "";
    if (!normalized.studentGivenName && parts.length > 1) normalized.studentGivenName = parts.slice(1).join(" ");
  }
  normalized.createdAt = student.createdAt || now;
  normalized.updatedAt = student.updatedAt || now;
  return normalized;
}

function studentToRow_(student) {
  return HEADERS.map(function(key) { return cell_(student[key]); });
}

function viewRow_(student) {
  return VIEW_FIELDS.map(function(key) { return cell_(student[key]); });
}

function cell_(value) {
  return value === null || value === undefined ? "" : value;
}

function studentMatchesKey_(student, key) {
  if (!key) return false;
  const id = String(student.id || "").trim();
  const code = String(student.studentCode || student.studentId || "").trim();
  return id === key || code === key;
}

function studentNameKey_(student) {
  const name = String((student && student.studentName) || [student && student.studentSurname, student && student.studentGivenName].filter(Boolean).join(" ") || "");
  return name
    .normalize("NFC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .toLocaleLowerCase()
    .replace(/[\s\u00A0]+/g, "");
}

function sameStudentName_(left, right) {
  const leftName = studentNameKey_(left);
  return !!leftName && leftName === studentNameKey_(right);
}

function dedupeStudentsByName_(students) {
  const names = {};
  return students.filter(function(student) {
    const key = studentNameKey_(student);
    if (!key) return true;
    if (names[key]) return false;
    names[key] = true;
    return true;
  });
}

function sortStudents_(students) {
  return students.slice().sort(function(a, b) {
    return className_(a).localeCompare(className_(b), "km-KH")
      || String(a.studentName || "").localeCompare(String(b.studentName || ""), "km-KH")
      || String(a.studentCode || "").localeCompare(String(b.studentCode || ""), "km-KH");
  });
}

function className_(student) {
  return String((student && student.className) || "មិនទាន់មានថ្នាក់").trim() || "មិនទាន់មានថ្នាក់";
}

function groupStudentsByClass_(students) {
  const groups = {};
  sortStudents_(students).forEach(function(student) {
    const cls = className_(student);
    if (!groups[cls]) groups[cls] = [];
    groups[cls].push(student);
  });
  return Object.keys(groups).sort(function(a, b) {
    return a.localeCompare(b, "km-KH");
  }).map(function(cls) {
    return [cls, groups[cls]];
  });
}

function refreshWorkbookDesign_(students) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sorted = sortStudents_(students || []);
  [["dashboard", rebuildDashboard_], ["by-class", rebuildByClassSheet_], ["class tabs", rebuildClassSheets_]]
    .forEach(function(step) {
      try { step[1](ss, sorted); }
      catch (err) { throw new Error("Refresh " + step[0] + ": " + String(err && err.message || err)); }
    });
}

function rebuildDashboard_(ss, students) {
  const sheet = getOrCreateSheet_(ss, DASHBOARD_SHEET_NAME);
  resetSheet_(sheet);
  sheet.setTabColor("#0f766e");
  sheet.setHiddenGridlines(true);

  const groups = groupStudentsByClass_(students);
  ensureRows_(sheet, Math.max(8, groups.length + 7));
  const male = students.filter(function(s) { return s.gender === "ប្រុស"; }).length;
  const female = students.filter(function(s) { return s.gender === "ស្រី"; }).length;
  const schools = countUnique_(students, "fromSchool");
  const updatedText = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

  sheet.getRange(1, 1, 1, 8).merge()
    .setValue("ផ្ទាំងសង្ខេបសិស្ស")
    .setBackground("#0f766e")
    .setFontColor("#ffffff")
    .setFontSize(18)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  sheet.getRange(2, 1, 1, 8).merge()
    .setValue("ធ្វើបច្ចុប្បន្នភាព: " + updatedText)
    .setBackground("#ccfbf1")
    .setFontColor("#115e59")
    .setHorizontalAlignment("center");

  sheet.getRange(4, 1, 1, 8).setValues([[
    "សរុប", students.length,
    "ប្រុស", male,
    "ស្រី", female,
    "ថ្នាក់", groups.length
  ]]);
  sheet.getRange(4, 1, 1, 8)
    .setBackground("#f8fafc")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setBorder(true, true, true, true, true, true, "#cbd5e1", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRangeList(["B4", "D4", "F4", "H4"]).setFontSize(18).setFontColor("#0f766e");

  sheet.getRange(6, 1, 1, 8).setValues([[
    "ថ្នាក់", "សរុប", "ប្រុស", "ស្រី", "សាលា", "មានទូរស័ព្ទ", "មានរូបថត", "សម្គាល់"
  ]]);
  styleHeader_(sheet.getRange(6, 1, 1, 8));

  const rows = groups.map(function(group) {
    const cls = group[0];
    const items = group[1];
    return [
      cls,
      items.length,
      items.filter(function(s) { return s.gender === "ប្រុស"; }).length,
      items.filter(function(s) { return s.gender === "ស្រី"; }).length,
      countUnique_(items, "fromSchool"),
      items.filter(function(s) { return String(s.contact || "").trim() !== ""; }).length,
      items.filter(function(s) { return String(s.photo || "").trim() !== ""; }).length,
      ""
    ];
  });
  if (rows.length) {
    sheet.getRange(7, 1, rows.length, 8).setValues(rows);
    styleBody_(sheet.getRange(7, 1, rows.length, 8));
  } else {
    sheet.getRange(7, 1, 1, 8).merge().setValue("មិនទាន់មានទិន្នន័យ").setHorizontalAlignment("center");
  }

  sheet.setFrozenRows(6);
  sheet.setColumnWidths(1, 8, 115);
  sheet.setRowHeights(1, Math.max(sheet.getLastRow(), 7), 32);
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 7), 8).setFontFamily("Arial").setVerticalAlignment("middle");
}

function rebuildByClassSheet_(ss, students) {
  const sheet = getOrCreateSheet_(ss, BY_CLASS_SHEET_NAME);
  resetSheet_(sheet);
  sheet.setTabColor("#2563eb");
  sheet.setHiddenGridlines(true);

  const colCount = VIEW_FIELDS.length;
  const groups = groupStudentsByClass_(students);
  ensureRows_(sheet, Math.max(3, 3 + groups.reduce(function(total, group) { return total + group[1].length + 3; }, 0)));
  sheet.getRange(1, 1, 1, colCount).merge()
    .setValue("បញ្ជីសិស្សតាមថ្នាក់")
    .setBackground("#2563eb")
    .setFontColor("#ffffff")
    .setFontSize(16)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  let row = 3;
  if (!groups.length) {
    sheet.getRange(row, 1, 1, colCount).merge().setValue("មិនទាន់មានទិន្នន័យ").setHorizontalAlignment("center");
  }
  groups.forEach(function(group) {
    const cls = group[0];
    const items = group[1];
    sheet.getRange(row, 1, 1, colCount).merge()
      .setValue("ថ្នាក់ " + cls + " - " + items.length + " នាក់")
      .setBackground("#ccfbf1")
      .setFontColor("#115e59")
      .setFontWeight("bold")
      .setFontSize(12);
    row++;
    sheet.getRange(row, 1, 1, colCount).setValues([VIEW_HEADER_ROW]);
    styleHeader_(sheet.getRange(row, 1, 1, colCount));
    row++;
    if (items.length) {
      sheet.getRange(row, 1, items.length, colCount).setValues(items.map(viewRow_));
      styleBody_(sheet.getRange(row, 1, items.length, colCount));
      row += items.length;
    }
    row++;
  });

  formatViewSheet_(sheet, colCount, 1);
}

function rebuildClassSheets_(ss, students) {
  ss.getSheets().forEach(function(sheet) {
    if (sheet.getName().indexOf(CLASS_SHEET_PREFIX) === 0) ss.deleteSheet(sheet);
  });

  const groups = groupStudentsByClass_(students);
  const usedNames = {};
  groups.forEach(function(group, index) {
    const cls = group[0];
    const items = group[1];
    const sheetName = uniqueSheetName_(ss, CLASS_SHEET_PREFIX + sanitizeSheetName_(cls), usedNames);
    const sheet = ss.insertSheet(sheetName);
    resetSheet_(sheet);
    ensureRows_(sheet, Math.max(5, items.length + 4));
    sheet.setTabColor(CLASS_TAB_COLORS[index % CLASS_TAB_COLORS.length]);
    sheet.setHiddenGridlines(true);

    const colCount = VIEW_FIELDS.length;
    sheet.getRange(1, 1, 1, colCount).merge()
      .setValue("ថ្នាក់ " + cls)
      .setBackground(CLASS_TAB_COLORS[index % CLASS_TAB_COLORS.length])
      .setFontColor("#ffffff")
      .setFontSize(16)
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheet.getRange(2, 1, 1, colCount).merge()
      .setValue("សរុប " + items.length + " នាក់")
      .setBackground("#f8fafc")
      .setFontColor("#475569")
      .setHorizontalAlignment("center");
    sheet.getRange(4, 1, 1, colCount).setValues([VIEW_HEADER_ROW]);
    styleHeader_(sheet.getRange(4, 1, 1, colCount));
    if (items.length) {
      sheet.getRange(5, 1, items.length, colCount).setValues(items.map(viewRow_));
      styleBody_(sheet.getRange(5, 1, items.length, colCount));
    }
    sheet.setFrozenRows(4);
    formatViewSheet_(sheet, colCount, 4);
  });
}

function formatStudentsSheet_(sheet) {
  ensureColumns_(sheet, HEADERS.length);
  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.setTabColor("#0f766e");
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.setHiddenGridlines(true);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADER_ROW]);
  styleHeader_(sheet.getRange(1, 1, 1, HEADERS.length));
  sheet.setRowHeight(1, 42);
  STUDENT_COLUMN_WIDTHS.forEach(function(width, index) {
    sheet.setColumnWidth(index + 1, width);
  });
  if (lastRow > 1) {
    const body = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
    styleBody_(body);
    sheet.getRange(2, 2, lastRow - 1, 1).setNumberFormat("@");
    sheet.getRange(2, 12, lastRow - 1, 1).setNumberFormat("@");
    ["dob", "fatherDob", "motherDob", "guardianDob"].forEach(function(field) {
      const column = HEADERS.indexOf(field) + 1;
      if (column > 0) sheet.getRange(2, column, lastRow - 1, 1).setNumberFormat("yyyy-mm-dd");
    });
  }
  applyBanding_(sheet, 1, 1, Math.max(lastRow, 2), HEADERS.length);
  recreateFilter_(sheet, 1, 1, Math.max(lastRow, 2), HEADERS.length);
  sheet.showColumns(1, HEADERS.length);
  sheet.hideColumns(1);
  sheet.hideColumns(20, 2);
}

function formatViewSheet_(sheet, colCount, frozenRows) {
  ensureColumns_(sheet, colCount);
  const lastRow = Math.max(sheet.getLastRow(), 1);
  VIEW_COLUMN_WIDTHS.forEach(function(width, index) {
    if (index < colCount) sheet.setColumnWidth(index + 1, width);
  });
  sheet.setFrozenRows(frozenRows || 1);
  sheet.getRange(1, 1, lastRow, colCount).setFontFamily("Arial").setVerticalAlignment("middle").setWrap(true);
  if (lastRow > 1) {
    const phoneCol = VIEW_FIELDS.indexOf("contact") + 1;
    ["dob", "fatherDob", "motherDob", "guardianDob"].forEach(function(field) {
      const column = VIEW_FIELDS.indexOf(field) + 1;
      if (column > 0) sheet.getRange(1, column, lastRow, 1).setNumberFormat("yyyy-mm-dd");
    });
    if (phoneCol > 0) sheet.getRange(1, phoneCol, lastRow, 1).setNumberFormat("@");
  }
  sheet.setRowHeights(1, lastRow, 30);
}

function styleHeader_(range) {
  range
    .setBackground("#0f766e")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, "#0f766e", SpreadsheetApp.BorderStyle.SOLID);
}

function styleBody_(range) {
  range
    .setBackground("#ffffff")
    .setFontColor("#0f172a")
    .setVerticalAlignment("middle")
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, "#dbe7e4", SpreadsheetApp.BorderStyle.SOLID);
}

function applyBanding_(sheet, row, col, numRows, numCols) {
  sheet.getBandings().forEach(function(banding) { banding.remove(); });
  if (numRows < 2) return;
  const banding = sheet.getRange(row, col, numRows, numCols).applyRowBanding();
  banding.setHeaderRowColor("#0f766e");
  banding.setFirstRowColor("#ffffff");
  banding.setSecondRowColor("#f0fdfa");
}

function recreateFilter_(sheet, row, col, numRows, numCols) {
  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(row, col, numRows, numCols).createFilter();
}

function resetSheet_(sheet) {
  ensureColumns_(sheet, Math.max(HEADERS.length, VIEW_FIELDS.length, 8));
  // A merged title can extend beyond getDataRange() when its other cells are
  // empty. Unmerge the complete grid so a later rebuild never clips a merge.
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  sheet.clear();
  sheet.clearConditionalFormatRules();
  sheet.getBandings().forEach(function(banding) { banding.remove(); });
  const filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.showColumns(1, sheet.getMaxColumns());
}

function getOrCreateSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureColumns_(sheet, needed) {
  const current = sheet.getMaxColumns();
  if (current < needed) sheet.insertColumnsAfter(current, needed - current);
}

function ensureRows_(sheet, needed) {
  const current = sheet.getMaxRows();
  if (current < needed) sheet.insertRowsAfter(current, needed - current);
}

function countUnique_(students, key) {
  const seen = {};
  students.forEach(function(student) {
    const value = String(student[key] || "").trim();
    if (value) seen[value] = true;
  });
  return Object.keys(seen).length;
}

function sanitizeSheetName_(name) {
  const cleaned = String(name || "មិនទាន់មានថ្នាក់")
    .replace(/[\\\/\?\*\[\]\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "មិនទាន់មានថ្នាក់").slice(0, 88);
}

function uniqueSheetName_(ss, baseName, usedNames) {
  let base = String(baseName || CLASS_SHEET_PREFIX + "មិនទាន់មានថ្នាក់").slice(0, 99);
  let name = base;
  let n = 2;
  while (ss.getSheetByName(name) || usedNames[name]) {
    const suffix = " " + n;
    name = base.slice(0, 100 - suffix.length) + suffix;
    n++;
  }
  usedNames[name] = true;
  return name;
}
