// Minimal stand-in for the Apps Script web app, used to rehearse
// scripts/migrate-from-sheet.ts. Response shapes follow google-sheet-backend.gs.
import { createServer } from "node:http";
import { hashPin } from "../src/portal.ts";

const KEY = "mock-key";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
export const MOCK_CLASS_CODE = "0123456789";

const students = Array.from({ length: 130 }, (_, i) => ({
  id: i === 7 ? "" : i === 9 ? "rec-8" : `rec-${i}`, // one missing id, one duplicate
  studentCode: `90226${i < 70 ? "07" : "08"}${String(i + 1).padStart(3, "0")}`,
  studentName: `សិស្ស ${i}`, studentSurname: "សិស្ស", studentGivenName: String(i),
  gender: i % 2 ? "ប្រុស" : "ស្រី", dob: "2012-01-01", className: i < 70 ? "7A" : "8B",
  studentLatinName: i === 3 ? "SISS THREE" : "", createdAt: "2026-01-01T00:00:00Z", updatedAt: `2026-01-0${1 + (i % 9)}T00:00:00Z`,
  photo: ""
}));
const photos: Record<string, string> = { "rec-0": PNG, "rec-1": PNG, "rec-2": "https://example.org/photo.jpg" };
const salt = "mock-salt";
const portal = {
  access: [{ scope: "class", className: "7A", salt, pinHash: hashPin(salt, MOCK_CLASS_CODE), teacherName: "គ្រូ ក", enabled: "TRUE", updatedAt: "2026-01-01" }],
  attendance: [{ key: "7A|2026-02-01|ព្រឹក|rec-0", className: "7A", studentId: "rec-0", date: "2026-02-01", period: "ព្រឹក", status: "អវត្តមាន", reason: "", updatedAt: "x", actor: "គ្រូ ក" }],
  scores: [{ key: "7A|rec-0|គណិត|ខែ|2026-02-01", className: "7A", studentId: "rec-0", subject: "គណិត", assessment: "ខែ", date: "2026-02-01", maxScore: "50", score: "40", notes: "", updatedAt: "x", actor: "គ្រូ ក" }],
  activities: [{ id: "act-1", className: "7A", date: "2026-02-01", title: "ប្រជុំ", details: "", updatedAt: "x", actor: "គ្រូ ក" }]
};
const settings = { issueDate: "", principalName: "នាយក", studentCodePrefix: "STU", studentCodeDigits: 4, academicYearStart: 2026, classTeachers: { "7A": "គ្រូ ក" } };

export function startMockSheet(port = 8790) {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const p = Object.fromEntries(url.searchParams);
    const send = (payload: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(payload)); };
    if (p.key !== KEY) return send({ ok: false, error: "Unauthorized: admin access key is missing or incorrect" });
    if (p.action === "listpage") {
      const offset = Number(p.offset || 0), limit = Math.min(100, Number(p.limit || 64));
      return send({ ok: true, students: students.slice(offset, offset + limit), offset, limit, total: students.length, settings: offset === 0 ? settings : undefined });
    }
    if (p.action === "photos") {
      const keys = String(p.studentIds || "").split(",").slice(0, 24);
      return send({ ok: true, students: students.filter(s => keys.includes(s.id)).map(s => ({ id: s.id, studentCode: s.studentCode, photo: photos[s.id] || "" })) });
    }
    if (p.action === "exportportal") return send({ ok: true, ...portal });
    return send({ ok: false, error: "Unknown action" });
  });
  return new Promise<typeof server>(resolve => server.listen(port, () => resolve(server)));
}

if (process.argv.includes("--serve")) {
  await startMockSheet();
  console.log("mock sheet on http://localhost:8790");
}
