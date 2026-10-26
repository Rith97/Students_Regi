// Class-scoped teacher portal. No student row or existing workbook column is
// changed when its supporting tabs are created.
const PORTAL_ACCESS_SHEET = "_Portal Access";
const PORTAL_ATTENDANCE_SHEET = "Portal Attendance";
const PORTAL_SCORES_SHEET = "Portal Scores";
const PORTAL_ACTIVITIES_SHEET = "Portal Activities";
const PORTAL_ACCESS_HEADERS = ["scope", "className", "salt", "pinHash", "teacherName", "enabled", "updatedAt"];
const PORTAL_ATTENDANCE_HEADERS = ["key", "className", "studentId", "date", "period", "status", "reason", "updatedAt", "actor"];
const PORTAL_SCORE_HEADERS = ["key", "className", "studentId", "subject", "assessment", "date", "maxScore", "score", "notes", "updatedAt", "actor"];
const PORTAL_ACTIVITY_HEADERS = ["id", "className", "date", "title", "details", "updatedAt", "actor"];
const PORTAL_SESSION_SECONDS = 21600;
const PORTAL_REMEMBER_SECONDS = 30 * 24 * 60 * 60;
const PORTAL_REMEMBER_PROPERTY_PREFIX = "portal-remember:";
const PORTAL_ADMIN_SCOPE = "admin";
const PORTAL_ADMIN_REQUIRED_PROPERTY = "PORTAL_ADMIN_REQUIRED";
const PORTAL_ATTENDANCE_STATUSES = ["អវត្តមាន", "មកយឺត", "សុំច្បាប់", "មានវត្តមាន"];

function portalSheet_(name, headers, create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet && !create) return null;
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1d4ed8").setFontColor("#ffffff").setFontWeight("bold");
    if (name === PORTAL_ACCESS_SHEET) sheet.hideSheet();
  }
  const existing = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (existing.some(function(value, index) { return value !== headers[index]; })) {
    throw new Error("Portal tab header mismatch: " + name);
  }
  return sheet;
}

function portalAccessRows_() {
  const sheet = portalSheet_(PORTAL_ACCESS_SHEET, PORTAL_ACCESS_HEADERS, false);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, PORTAL_ACCESS_HEADERS.length)
    .getDisplayValues().map(function(row, index) { return { rowNumber:index + 2, scope:row[0], className:row[1],
      salt:row[2], pinHash:row[3], teacherName:row[4], enabled:String(row[5]).toUpperCase() === "TRUE", updatedAt:row[6] }; });
}

function portalAccessRow_(scope, className) {
  return portalAccessRows_().find(function(row) { return row.scope === scope && row.className === className; }) || null;
}

function portalAdminCredential_() {
  const row = portalAccessRow_(PORTAL_ADMIN_SCOPE, "");
  const credential = row && row.enabled && row.salt && row.pinHash ? row : null;
  if (credential) {
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(PORTAL_ADMIN_REQUIRED_PROPERTY) !== "1") {
      properties.setProperty(PORTAL_ADMIN_REQUIRED_PROPERTY, "1");
    }
  }
  return credential;
}

function portalHashPin_(salt, pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + ":" + String(pin), Utilities.Charset.UTF_8)
    .map(function(byte) { return (byte & 255).toString(16).padStart(2, "0"); }).join("");
}

function portalPinMatches_(row, pin) {
  return !!row && row.enabled && !!row.salt && !!row.pinHash &&
    portalHashPin_(row.salt, String(pin || "")) === row.pinHash;
}

function portalRandomPin_() {
  const bytes = Utilities.getUuid().replace(/-/g, "").match(/.{2}/g);
  return bytes.slice(0, 12).map(function(pair) { return String(parseInt(pair, 16) % 10); }).join("");
}

function portalPhoneCode_(value) {
  const raw = String(value || "").trim().replace(/[០-៩]/g, function(digit) { return String("០១២៣៤៥៦៧៨៩".indexOf(digit)); });
  if (!raw) return "";
  if (!/^\+?[\d\s().-]+$/.test(raw)) throw new Error("លេខទូរសព្ទត្រូវមានតែលេខ និងសញ្ញាបំបែកធម្មតា");
  let digits = raw.replace(/\D/g, "");
  if (digits.indexOf("855") === 0) digits = "0" + digits.slice(3);
  if (!/^0[1-9]\d{7,8}$/.test(digits)) throw new Error("លេខទូរសព្ទត្រូវមាន ៩ ឬ ១០ ខ្ទង់ (ឧ. 0123456789)");
  return digits;
}

function portalRandomPhoneCode_() {
  // Numeric, phone-length credentials for classes without a supplied phone.
  const entropy = portalHashPin_(Utilities.getUuid(), Utilities.getUuid()).match(/.{2}/g);
  return "0" + String(1 + parseInt(entropy[0], 16) % 9) + entropy.slice(1, 9)
    .map(function(pair) { return String(parseInt(pair, 16) % 10); }).join("");
}

function portalClasses_() {
  const sheet = getStudentsSheet_();
  const count = Math.max(0, sheet.getLastRow() - 1);
  if (!count) return [];
  const counts = {};
  sheet.getRange(2, HEADERS.indexOf("className") + 1, count, 1).getDisplayValues().forEach(function(row) {
    const name = String(row[0] || "").trim();
    if (name) counts[name] = (counts[name] || 0) + 1;
  });
  return Object.keys(counts).sort(function(a, b) { return a.localeCompare(b, "km-KH", { numeric:true }); })
    .map(function(name) { return { className:name, count:counts[name] }; });
}

function teacherPortalClasses() {
  return portalClasses_();
}

function portalRememberKey_(token) {
  return PORTAL_REMEMBER_PROPERTY_PREFIX + portalHashPin_("session", token);
}

function teacherPortalLogin(className, pin, remember) {
  const cls = String(className || "").trim();
  const supplied = String(pin || "").trim();
  if (!supplied || supplied.length > 80) throw new Error("សូមបញ្ចូលលេខកូដ");
  const scope = cls === "__admin__" ? PORTAL_ADMIN_SCOPE : "class";
  if (scope === "class" && !portalClasses_().some(function(item) { return item.className === cls; })) {
    throw new Error("មិនមានថ្នាក់នេះទេ");
  }
  const cache = CacheService.getScriptCache();
  const throttleKey = "portal-fails:" + portalHashPin_("scope", scope + ":" + cls).slice(0, 35);
  const failures = Number(cache.get(throttleKey) || 0);
  if (failures >= 20) throw new Error("សាកលេខកូដច្រើនដងពេក។ សូមរង់ចាំ ១៥ នាទី");
  const credential = portalAccessRow_(scope, scope === PORTAL_ADMIN_SCOPE ? "" : cls);
  let normalized = supplied;
  if (scope === "class" && /^[+\d\s().-]+$/.test(supplied) && /^\+?855|^0/.test(supplied)) {
    try { normalized = portalPhoneCode_(supplied); } catch (err) { normalized = supplied; }
  }
  if (!portalPinMatches_(credential, normalized)) {
    cache.put(throttleKey, String(failures + 1), 900);
    throw new Error("លេខកូដមិនត្រឹមត្រូវ ឬថ្នាក់មិនទាន់បើកប្រើ");
  }
  cache.remove(throttleKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  const session = { scope:scope, className:cls, credentialHash:credential.pinHash };
  const persistent = remember === true && scope === "class";
  if (persistent) {
    session.expiresAt = Date.now() + PORTAL_REMEMBER_SECONDS * 1000;
    PropertiesService.getScriptProperties().setProperty(portalRememberKey_(token), JSON.stringify(session));
  } else {
    cache.put("portal-session:" + token, JSON.stringify(session), PORTAL_SESSION_SECONDS);
  }
  return { token:token, role:scope, className:scope === PORTAL_ADMIN_SCOPE ? "" : cls,
    teacherName:credential.teacherName || "", remembered:persistent,
    expiresIn:persistent ? PORTAL_REMEMBER_SECONDS : PORTAL_SESSION_SECONDS };
}

function portalSession_(token, adminOnly) {
  const key = String(token || "").trim();
  if (!/^[0-9a-f-]{72}$/.test(key)) throw new Error("សូមចូលប្រើ Portal ម្តងទៀត");
  const properties = PropertiesService.getScriptProperties();
  const cached = CacheService.getScriptCache().get("portal-session:" + key) || properties.getProperty(portalRememberKey_(key));
  if (!cached) throw new Error("Session ផុតកំណត់។ សូមចូលប្រើម្តងទៀត");
  const session = JSON.parse(cached);
  if (session.expiresAt && Date.now() > Number(session.expiresAt)) {
    properties.deleteProperty(portalRememberKey_(key));
    throw new Error("Session ផុតកំណត់។ សូមចូលប្រើម្តងទៀត");
  }
  const credential = portalAccessRow_(session.scope, session.scope === PORTAL_ADMIN_SCOPE ? "" : session.className);
  if (!credential || !credential.enabled || credential.pinHash !== session.credentialHash) {
    throw new Error("សិទ្ធិចូលប្រើត្រូវបានផ្លាស់ប្តូរ។ សូមចូលម្ដងទៀត");
  }
  if (adminOnly && session.scope !== PORTAL_ADMIN_SCOPE) throw new Error("ត្រូវការសិទ្ធិរដ្ឋបាល");
  return { scope:session.scope, className:session.className, actor:credential.teacherName ||
    (session.scope === PORTAL_ADMIN_SCOPE ? "រដ្ឋបាល" : "គ្រូថ្នាក់ " + session.className) };
}

function teacherPortalLogout(token) {
  const key = String(token || "").trim();
  if (!/^[0-9a-f-]{72}$/.test(key)) return false;
  CacheService.getScriptCache().remove("portal-session:" + key);
  PropertiesService.getScriptProperties().deleteProperty(portalRememberKey_(key));
  return true;
}

function portalAssertClass_(session, className) {
  const wanted = String(className || session.className || "").trim();
  if (!portalClasses_().some(function(item) { return item.className === wanted; })) throw new Error("មិនមានថ្នាក់នេះទេ");
  if (session.scope !== PORTAL_ADMIN_SCOPE && session.className !== wanted) throw new Error("មិនមានសិទ្ធិលើថ្នាក់នេះ");
  return wanted;
}

function teacherPortalAdminOverview(token) {
  portalSession_(token, true);
  const access = portalAccessRows_();
  const teachers = readAppSettings_().classTeachers || {};
  return portalClasses_().map(function(item) {
    const row = access.find(function(entry) { return entry.scope === "class" && entry.className === item.className; });
    return { className:item.className, count:item.count, teacherName:row && row.teacherName || String(teachers[item.className] || ""), enabled:!!row && row.enabled };
  });
}

function teacherPortalIssueClassPin(token, className, teacherName, phoneNumber) {
  portalSession_(token, true);
  return withWriteLock_(function() {
    const cls = portalAssertClass_({ scope:PORTAL_ADMIN_SCOPE }, className);
    const sheet = portalSheet_(PORTAL_ACCESS_SHEET, PORTAL_ACCESS_HEADERS, true);
    const previous = portalAccessRow_("class", cls);
    const pin = portalPhoneCode_(phoneNumber) || portalRandomPhoneCode_();
    if (portalAccessRows_().some(function(row) { return row.scope === "class" && row.className !== cls && portalPinMatches_(row, pin); })) {
      throw new Error("លេខនេះត្រូវបានប្រើសម្រាប់ថ្នាក់ផ្សេងរួចហើយ");
    }
    const salt = Utilities.getUuid();
    const name = String(teacherName || "").trim().slice(0, 100);
    const row = ["class", cls, salt, portalHashPin_(salt, pin), name, true, new Date().toISOString()];
    const rowNumber = previous ? previous.rowNumber : sheet.getLastRow() + 1;
    ensureRows_(sheet, rowNumber);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { className:cls, teacherName:name, pin:pin };
  });
}

function teacherPortalIssueAllClassCodes(token, assignments) {
  portalSession_(token, true);
  const provided = assignments && typeof assignments === "object" && !Array.isArray(assignments) ? assignments : {};
  return withWriteLock_(function() {
    const classes = portalClasses_();
    if (!classes.length) throw new Error("មិនមានថ្នាក់សម្រាប់បង្កើតលេខកូដ");
    if (classes.length > 300) throw new Error("ថ្នាក់ច្រើនពេកសម្រាប់បង្កើតម្តង");
    const known = {};
    classes.forEach(function(item) { known[item.className] = true; });
    Object.keys(provided).forEach(function(cls) { if (!known[cls]) throw new Error("មិនមានថ្នាក់ " + cls); });
    const sheet = portalSheet_(PORTAL_ACCESS_SHEET, PORTAL_ACCESS_HEADERS, true);
    const access = portalAccessRows_();
    const teacherSettings = readAppSettings_().classTeachers || {};
    const now = new Date().toISOString();
    const used = {};
    const issued = classes.map(function(item) {
      const input = provided[item.className] || {};
      const prior = access.find(function(row) { return row.scope === "class" && row.className === item.className; });
      const teacherName = String(input.teacherName || prior && prior.teacherName || teacherSettings[item.className] || "").trim().slice(0, 100);
      let code = portalPhoneCode_(input.phoneNumber);
      if (!code) {
        let tries = 0;
        do { code = portalRandomPhoneCode_(); tries++; } while (used[code] && tries < 20);
      }
      if (used[code]) throw new Error("លេខទូរសព្ទ/លេខកូដជាន់គ្នាសម្រាប់ថ្នាក់ " + item.className);
      used[code] = true;
      const salt = Utilities.getUuid();
      return { className:item.className, teacherName:teacherName, code:code,
        rowNumber:prior ? prior.rowNumber : null,
        row:["class", item.className, salt, portalHashPin_(salt, code), teacherName, true, now] };
    });
    // Generate the file before changing credentials, so export failures do not rotate logins.
    const xlsxBase64 = portalCodesXlsx_(issued);
    let nextRow = sheet.getLastRow() + 1;
    issued.forEach(function(item) {
      const rowNumber = item.rowNumber || nextRow++;
      ensureRows_(sheet, rowNumber);
      sheet.getRange(rowNumber, 1, 1, PORTAL_ACCESS_HEADERS.length).setValues([item.row]);
    });
    return { filename:"teacher-portal-codes-" + now.slice(0, 10) + ".xlsx", xlsxBase64:xlsxBase64,
      codes:issued.map(function(item) { return { className:item.className, teacherName:item.teacherName, code:item.code }; }) };
  });
}

function portalCodesXlsx_(items) {
  const escape = function(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); };
  const cell = function(ref, value, style) { return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t>' + escape(value) + '</t></is></c>'; };
  const rows = ['<row r="1" ht="30" customHeight="1">' + cell("A1", "លេខកូដចូល Teacher Portal", 1) + '</row>',
    '<row r="2">' + cell("A2", "ឯកសារសម្ងាត់ — ផ្ដល់លេខកូដទៅគ្រូតាមថ្នាក់ប៉ុណ្ណោះ", 2) + '</row>',
    '<row r="4" ht="26" customHeight="1">' + cell("A4", "ថ្នាក់", 3) + cell("B4", "ឈ្មោះគ្រូបន្ទុកថ្នាក់", 3) + cell("C4", "លេខកូដ", 3) + '</row>'];
  items.forEach(function(item, index) { const n = index + 5;
    rows.push('<row r="' + n + '" ht="23" customHeight="1">' + cell("A" + n, item.className, 0) +
      cell("B" + n, item.teacherName, 0) + cell("C" + n, item.code, 4) + '</row>'); });
  const last = items.length + 4;
  const files = {
    "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Teacher Codes" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="15"/><color rgb="FF17365D"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F6FB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="2" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml":'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="22" customWidth="1"/></cols><sheetData>' + rows.join("") + '</sheetData><autoFilter ref="A4:C' + last + '"/></worksheet>'
  };
  const blobs = Object.keys(files).map(function(path) { return Utilities.newBlob(files[path], "application/xml", path); });
  return Utilities.base64Encode(Utilities.zip(blobs, "teacher-codes.xlsx").getBytes());
}

function teacherPortalDisableClassPin(token, className) {
  portalSession_(token, true);
  return withWriteLock_(function() {
    const cls = portalAssertClass_({ scope:PORTAL_ADMIN_SCOPE }, className);
    const row = portalAccessRow_("class", cls);
    if (!row) return { className:cls, enabled:false };
    const sheet = portalSheet_(PORTAL_ACCESS_SHEET, PORTAL_ACCESS_HEADERS, false);
    sheet.getRange(row.rowNumber, 6, 1, 2).setValues([[false, new Date().toISOString()]]);
    return { className:cls, enabled:false };
  });
}

function portalRoster_(className) {
  const sheet = getStudentsSheet_();
  const count = Math.max(0, sheet.getLastRow() - 1);
  if (!count) return [];
  const photoIndex = HEADERS.indexOf("photo");
  const left = sheet.getRange(2, 1, count, photoIndex).getValues();
  const right = sheet.getRange(2, photoIndex + 2, count, HEADERS.length - photoIndex - 1).getValues();
  return left.map(function(row, index) { return rowToStudent_(row.concat([""], right[index])); })
    .filter(function(student) { return String(student.className || "").trim() === className && String(student.id || "").trim(); })
    .map(function(student) {
      const result = {};
      ["id", "studentCode", "studentName", "studentSurname", "studentGivenName", "studentLatinName", "gender", "dob", "className",
       "fromSchool", "contact", "guardianName", "guardianDob", "fatherName", "fatherPhone", "fatherDob", "fatherOccupation",
       "motherName", "motherPhone", "motherDob", "motherOccupation",
       "pobVillage", "pobCommune", "pobDistrict", "pobProvince", "currentVillage", "currentCommune", "currentDistrict",
       "currentProvince", "updatedAt"].forEach(function(key) { result[key] = student[key] || ""; });
      return result;
    });
}

function teacherPortalAssignMissingCodes(token, className) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  return withWriteLock_(function() {
    const sheet = getStudentsSheet_();
    const count = Math.max(0, sheet.getLastRow() - 1);
    if (!count) return { className:cls, assigned:0 };
    const rows = sheet.getRange(2, 1, count, HEADERS.length).getValues();
    const academicYear = studentCodeAcademicYear_();
    const used = new Set(rows.map(function(row) { return String(row[HEADERS.indexOf("studentCode")] || "").trim(); }).filter(Boolean));
    const classIndex = HEADERS.indexOf("className");
    const codeIndex = HEADERS.indexOf("studentCode");
    const updatedIndex = HEADERS.indexOf("updatedAt");
    let assigned = 0;
    rows.forEach(function(row) {
      if (String(row[classIndex] || "").trim() !== cls || String(row[codeIndex] || "").trim()) return;
      row[codeIndex] = allocateStudentCode_(cls, "", [...used], academicYear);
      used.add(row[codeIndex]);
      row[updatedIndex] = new Date().toISOString();
      assigned++;
    });
    if (assigned) sheet.getRange(2, 1, count, HEADERS.length).setValues(rows);
    if (assigned) touchRevision_(DATA_REVISION_PROPERTY);
    return { className:cls, assigned:assigned };
  });
}

function teacherPortalRoster(token, className) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  return { className:cls, teacherName:session.actor, students:portalRoster_(cls) };
}

// Images stay out of the initial roster so a class opens quickly on a phone.
// Fetch only visible portraits, and recheck every requested record's class.
function teacherPortalPhotos(token, className, studentIds) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  if (!Array.isArray(studentIds) || !studentIds.length || studentIds.length > 4) {
    throw new Error("សូមស្នើរូបថតពី ១ ដល់ ៤ នាក់ក្នុងមួយដង");
  }
  const requested = studentIds.map(function(id) { return String(id || "").trim(); });
  if (requested.some(function(id) { return !id; }) || new Set(requested).size !== requested.length) {
    throw new Error("អត្តសញ្ញាណរូបថតមិនត្រឹមត្រូវ");
  }
  const sheet = getStudentsSheet_();
  const count = Math.max(0, sheet.getLastRow() - 1);
  const ids = count ? sheet.getRange(2, HEADERS.indexOf("id") + 1, count, 1).getDisplayValues() : [];
  const byId = Object.create(null);
  ids.forEach(function(row, index) { if (row[0]) byId[String(row[0]).trim()] = index + 2; });
  const rows = requested.map(function(id) {
    const rowNumber = byId[id];
    if (!rowNumber) throw new Error("រកមិនឃើញសិស្សសម្រាប់រូបថត");
    return { id:id, rowNumber:rowNumber };
  });
  rows.forEach(function(item) {
    const actualClass = String(sheet.getRange(item.rowNumber, HEADERS.indexOf("className") + 1).getDisplayValue() || "").trim();
    if (actualClass !== cls) throw new Error("មិនមានសិទ្ធិមើលរូបថតថ្នាក់ផ្សេង");
  });
  return rows.map(function(item) {
    const value = sheet.getRange(item.rowNumber, HEADERS.indexOf("photo") + 1).getValue();
    return { id:item.id, photo:photoForClient_(value) };
  });
}

function portalDate_(value) {
  const date = String(value || "").trim();
  const parsed = new Date(date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("កាលបរិច្ឆេទមិនត្រឹមត្រូវ");
  }
  return date;
}

function portalPeriod_(value) {
  const period = String(value || "").trim();
  if (!["ព្រឹក", "រសៀល", "ពេញថ្ងៃ"].includes(period)) throw new Error("សូមជ្រើសរើសវេនត្រឹមត្រូវ");
  return period;
}

function portalRecords_(name, headers) {
  const sheet = portalSheet_(name, headers, false);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues()
    .map(function(row, index) { return { rowNumber:index + 2, values:row }; })
    .filter(function(item) { return item.values[0]; });
}

function teacherPortalAttendance(token, className, date, period) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  const day = portalDate_(date);
  const shift = portalPeriod_(period);
  return portalRecords_(PORTAL_ATTENDANCE_SHEET, PORTAL_ATTENDANCE_HEADERS)
    .filter(function(item) { return item.values[1] === cls && item.values[3] === day && item.values[4] === shift; })
    .map(function(item) { return { studentId:item.values[2], status:item.values[5], reason:item.values[6], updatedAt:item.values[7] }; });
}

function teacherPortalSaveAttendance(token, className, date, period, entries) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  const day = portalDate_(date);
  const shift = portalPeriod_(period);
  if (!Array.isArray(entries) || entries.length > 250) throw new Error("ចំនួនកំណត់ត្រាអវត្តមានមិនត្រឹមត្រូវ");
  return withWriteLock_(function() {
    const allowed = new Set(portalRoster_(cls).map(function(student) { return String(student.id); }));
    const existing = portalRecords_(PORTAL_ATTENDANCE_SHEET, PORTAL_ATTENDANCE_HEADERS);
    const byKey = {};
    existing.forEach(function(item) { byKey[item.values[0]] = item.rowNumber; });
    const sheet = portalSheet_(PORTAL_ATTENDANCE_SHEET, PORTAL_ATTENDANCE_HEADERS, true);
    const seen = new Set();
    const newRows = [];
    const now = new Date().toISOString();
    entries.forEach(function(item) {
      const id = String(item.studentId || "").trim();
      const status = String(item.status || "").trim();
      if (!allowed.has(id)) throw new Error("សិស្សមិនស្ថិតក្នុងថ្នាក់នេះ");
      if (!PORTAL_ATTENDANCE_STATUSES.includes(status)) throw new Error("ស្ថានភាពវត្តមានមិនត្រឹមត្រូវ");
      const key = [cls, day, shift, id].join("|");
      if (seen.has(key)) throw new Error("សិស្សត្រូវបានបញ្ចូលពីរដង");
      seen.add(key);
      if (status === "មានវត្តមាន" && !byKey[key]) return;
      const row = [key, cls, id, day, shift, status, String(item.reason || "").trim().slice(0, 500), now, session.actor];
      if (byKey[key]) sheet.getRange(byKey[key], 1, 1, row.length).setValues([row]);
      else newRows.push(row);
    });
    if (newRows.length) {
      const start = sheet.getLastRow() + 1;
      ensureRows_(sheet, start + newRows.length - 1);
      sheet.getRange(start, 1, newRows.length, PORTAL_ATTENDANCE_HEADERS.length).setValues(newRows);
    }
    return { saved:seen.size, className:cls, date:day, period:shift };
  });
}

function teacherPortalScores(token, className, subject, assessment, date) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  const course = String(subject || "").trim();
  const exam = String(assessment || "").trim();
  const day = portalDate_(date);
  if (!course || !exam) return [];
  return portalRecords_(PORTAL_SCORES_SHEET, PORTAL_SCORE_HEADERS)
    .filter(function(item) { return item.values[1] === cls && item.values[3] === course &&
      item.values[4] === exam && item.values[5] === day; })
    .map(function(item) { return { studentId:item.values[2], score:item.values[7], maxScore:item.values[6],
      notes:item.values[8], updatedAt:item.values[9] }; });
}

function teacherPortalSaveScores(token, className, subject, assessment, date, maxScore, entries) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  const course = String(subject || "").trim().slice(0, 100);
  const exam = String(assessment || "").trim().slice(0, 100);
  const day = portalDate_(date);
  const maximum = Number(maxScore);
  if (!course || !exam) throw new Error("សូមបញ្ចូលមុខវិជ្ជា និងប្រភេទពិន្ទុ");
  if (!Number.isFinite(maximum) || maximum <= 0 || maximum > 1000) throw new Error("ពិន្ទុពេញត្រូវមានពី ១ ដល់ ១០០០");
  if (!Array.isArray(entries) || entries.length > 250) throw new Error("ចំនួនពិន្ទុមិនត្រឹមត្រូវ");
  return withWriteLock_(function() {
    const allowed = new Set(portalRoster_(cls).map(function(student) { return String(student.id); }));
    const existing = portalRecords_(PORTAL_SCORES_SHEET, PORTAL_SCORE_HEADERS);
    const byKey = {};
    existing.forEach(function(item) { byKey[item.values[0]] = item.rowNumber; });
    const sheet = portalSheet_(PORTAL_SCORES_SHEET, PORTAL_SCORE_HEADERS, true);
    const seen = new Set();
    const newRows = [];
    const now = new Date().toISOString();
    entries.forEach(function(item) {
      const id = String(item.studentId || "").trim();
      if (!allowed.has(id)) throw new Error("សិស្សមិនស្ថិតក្នុងថ្នាក់នេះ");
      const raw = String(item.score === undefined || item.score === null ? "" : item.score).trim();
      const score = raw === "" ? "" : Number(raw);
      if (score !== "" && (!Number.isFinite(score) || score < 0 || score > maximum)) {
        throw new Error("ពិន្ទុត្រូវនៅចន្លោះ ០ និង " + maximum);
      }
      const key = [cls, id, course, exam, day].join("|");
      if (seen.has(key)) throw new Error("ពិន្ទុសិស្សម្នាក់ត្រូវបានបញ្ចូលពីរដង");
      seen.add(key);
      if (score === "" && !byKey[key]) return;
      const row = [key, cls, id, course, exam, day, maximum, score,
        String(item.notes || "").trim().slice(0, 500), now, session.actor];
      if (byKey[key]) sheet.getRange(byKey[key], 1, 1, row.length).setValues([row]);
      else newRows.push(row);
    });
    if (newRows.length) {
      const start = sheet.getLastRow() + 1;
      ensureRows_(sheet, start + newRows.length - 1);
      sheet.getRange(start, 1, newRows.length, PORTAL_SCORE_HEADERS.length).setValues(newRows);
    }
    return { saved:seen.size, className:cls, subject:course, assessment:exam, date:day };
  });
}

function teacherPortalActivities(token, className) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  return portalRecords_(PORTAL_ACTIVITIES_SHEET, PORTAL_ACTIVITY_HEADERS)
    .filter(function(item) { return item.values[1] === cls; })
    .map(function(item) { return { id:item.values[0], date:item.values[2], title:item.values[3],
      details:item.values[4], updatedAt:item.values[5], actor:item.values[6] }; })
    .sort(function(a, b) { return b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt); })
    .slice(0, 100);
}

function teacherPortalSaveActivity(token, className, activity) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  const value = activity && typeof activity === "object" ? activity : {};
  const date = portalDate_(value.date);
  const title = String(value.title || "").trim().slice(0, 150);
  const details = String(value.details || "").trim().slice(0, 3000);
  if (!title) throw new Error("សូមបញ្ចូលចំណងជើងសកម្មភាព");
  return withWriteLock_(function() {
    const existing = portalRecords_(PORTAL_ACTIVITIES_SHEET, PORTAL_ACTIVITY_HEADERS);
    const wanted = String(value.id || "").trim();
    const target = wanted ? existing.find(function(item) { return item.values[0] === wanted; }) : null;
    if (wanted && (!target || target.values[1] !== cls)) throw new Error("មិនមានសិទ្ធិកែសកម្មភាពនេះ");
    const id = target ? wanted : Utilities.getUuid();
    const row = [id, cls, date, title, details, new Date().toISOString(), session.actor];
    const sheet = portalSheet_(PORTAL_ACTIVITIES_SHEET, PORTAL_ACTIVITY_HEADERS, true);
    const rowNumber = target ? target.rowNumber : sheet.getLastRow() + 1;
    ensureRows_(sheet, rowNumber);
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { id:id, className:cls, title:title };
  });
}

const PORTAL_EDITABLE_STUDENT_FIELDS = ["studentSurname", "studentGivenName", "studentLatinName", "gender", "dob", "fromSchool", "contact",
  "fatherName", "fatherPhone", "fatherDob", "fatherOccupation", "motherName", "motherPhone", "motherDob",
  "motherOccupation", "guardianName", "guardianDob",
  "pobVillage", "pobCommune", "pobDistrict", "pobProvince",
  "currentVillage", "currentCommune", "currentDistrict", "currentProvince"];

function teacherPortalUpdateStudent(token, className, studentId, changes, expectedUpdatedAt) {
  const session = portalSession_(token, false);
  const cls = portalAssertClass_(session, className);
  const id = String(studentId || "").trim();
  if (!id || !changes || typeof changes !== "object") throw new Error("ព័ត៌មានសិស្សមិនត្រឹមត្រូវ");
  return withWriteLock_(function() {
    const sheet = getStudentsSheet_();
    const count = Math.max(0, sheet.getLastRow() - 1);
    const ids = count ? sheet.getRange(2, 1, count, 1).getDisplayValues() : [];
    const index = ids.findIndex(function(row) { return row[0] === id; });
    if (index < 0) throw new Error("រកមិនឃើញសិស្ស");
    const rowNumber = index + 2;
    const rawRow = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
    const student = rowToStudent_(rawRow);
    if (String(student.className || "").trim() !== cls) throw new Error("សិស្សមិនស្ថិតក្នុងថ្នាក់នេះ");
    if (String(expectedUpdatedAt || "") !== String(student.updatedAt || "")) {
      throw new Error("ព័ត៌មានសិស្សបានផ្លាស់ប្តូរនៅឧបករណ៍ផ្សេង។ សូមផ្ទុកឡើងវិញ");
    }
    PORTAL_EDITABLE_STUDENT_FIELDS.forEach(function(field) {
      if (Object.prototype.hasOwnProperty.call(changes, field)) {
        student[field] = String(changes[field] || "").trim().slice(0, 160);
      }
    });
    student.studentName = [student.studentSurname, student.studentGivenName].filter(Boolean).join(" ").trim();
    if (!student.studentName) throw new Error("ឈ្មោះសិស្សមិនអាចទទេបាន");
    if (student.gender && !["ប្រុស", "ស្រី"].includes(student.gender)) throw new Error("ភេទមិនត្រឹមត្រូវ");
    if (student.dob) portalDate_(student.dob);
    if (student.studentName !== String(rawRow[HEADERS.indexOf("studentName")] || "").trim()) {
      const names = sheet.getRange(2, HEADERS.indexOf("studentName") + 1, count, 1).getDisplayValues();
      const duplicate = names.some(function(row, position) { return position !== index &&
        String(row[0] || "").trim().replace(/\s+/g, " ") === student.studentName.replace(/\s+/g, " "); });
      if (duplicate) throw new Error("ឈ្មោះសិស្សនេះមានរួចហើយ");
    }
    student.updatedAt = new Date().toISOString();
    PORTAL_EDITABLE_STUDENT_FIELDS.concat(["studentName", "updatedAt"]).forEach(function(field) {
      if (field === "studentName" || field === "updatedAt" || Object.prototype.hasOwnProperty.call(changes, field)) {
        rawRow[HEADERS.indexOf(field)] = student[field];
      }
    });
    sheet.getRange(rowNumber, 1, 1, HEADERS.length).setValues([rawRow]);
    touchRevision_(DATA_REVISION_PROPERTY);
    return { id:id, studentCode:student.studentCode, updatedAt:student.updatedAt };
  });
}
