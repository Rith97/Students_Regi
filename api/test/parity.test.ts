// The Neon API ports google-sheet-backend.gs / teacher-portal.gs. These tests run
// the original Apps Script functions in a VM next to the TypeScript port and
// require identical results, so behaviour cannot drift silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import {
  allocateStudentCode, studentCodeGrade, studentCodeStem, studentNameKey, normalizeIncomingStudent, mergeStudentRecord
} from "../src/students.ts";
import { hashPin, phoneCode } from "../src/portal.ts";

const gs = vm.createContext({
  console,
  Utilities: {
    computeDigest: (_algorithm: unknown, text: string) => [...createHash("sha256").update(text, "utf8").digest()].map(byte => byte > 127 ? byte - 256 : byte),
    DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" }
  }
});
vm.runInContext(readFileSync(new URL("../../google-sheet-backend.gs", import.meta.url), "utf8"), gs);
vm.runInContext(readFileSync(new URL("../../teacher-portal.gs", import.meta.url), "utf8"), gs);
const call = (name: string, ...args: unknown[]) => JSON.parse(JSON.stringify((gs as any)[name](...args)));
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

const classes = ["7A", "ថ្នាក់ទី៨B", "9", "10C", "11", "12 វិទ្យា", "6A", "13", "", "ទី 12A", "ថ្នាក់ ៧ក"];

test("grade parsing and code stems match", () => {
  for (const cls of classes) {
    assert.equal(studentCodeGrade(cls), (gs as any).studentCodeGrade_(cls), cls);
    for (const year of [2024, 2026, 2099]) assert.equal(studentCodeStem(cls, year), (gs as any).studentCodeStem_(cls, year), `${cls} ${year}`);
  }
});

test("code allocation matches", () => {
  const used = ["9022607001", "9022607002", "9022607010", "9022508001", "STU-1", ""];
  const cases: [string, string, string[]][] = [
    ["7A", "", used], ["7A", "9022607002", used], ["7A", "9022607002", used.filter(code => code !== "9022607002")],
    ["8B", "9022607001", used], ["11", "", []], ["6A", "OLD", used], ["10", "9022310999", []]
  ];
  for (const [cls, previous, others] of cases) {
    assert.equal(allocateStudentCode(cls, previous, others, 2026), (gs as any).allocateStudentCode_(cls, previous, others, 2026), `${cls} ${previous}`);
  }
});

test("name keys match", () => {
  for (const student of [{ studentName: "សុខ  ដារ៉ា" }, { studentSurname: "សុខ", studentGivenName: "ដារ៉ា" }, { studentName: "Sok​Dara" }, {}]) {
    assert.equal(studentNameKey(student), (gs as any).studentNameKey_(student));
  }
});

test("incoming normalisation and merge rules match", () => {
  const inputs = [
    { student: { recordId: "r1", studentName: "សុខ ដារ៉ា", className: "7A", createdAt: "2026-01-01", updatedAt: "2026-01-02" } },
    { studentId: "9022607001", student: { studentSurname: "ចាន់", studentGivenName: "មុនី", studentLatinName: "", photoChanged: true, createdAt: "x", updatedAt: "y" } },
    { id: "r3", studentName: "លី សុភា ស្រី", studentGivenName: "សុភា ស្រី", createdAt: "a", updatedAt: "b" }
  ];
  for (const input of inputs) {
    const ours = plain(normalizeIncomingStudent(input));
    const theirs = call("normalizeIncomingStudent_", input);
    assert.deepEqual(ours, theirs);
  }
  const existing = call("normalizeIncomingStudent_", { id: "r1", studentName: "សុខ ដារ៉ា", photo: "obj:students/a.jpg", classTrack: "វិទ្យា", studentLatinName: "SOK", createdAt: "a", updatedAt: "b" });
  const incoming = call("normalizeIncomingStudent_", { student: { id: "r1", studentName: "", photo: "", contact: "012", createdAt: "a", updatedAt: "c" } });
  assert.deepEqual(plain(mergeStudentRecord(existing, incoming)), call("mergeStudentRecord_", existing, incoming));
});

test("portal PIN hashes and phone codes match", () => {
  assert.equal(hashPin("salt-1", "0123456789"), (gs as any).portalHashPin_("salt-1", "0123456789"));
  assert.equal(hashPin("session", "ក-pin"), (gs as any).portalHashPin_("session", "ក-pin"));
  for (const value of ["012 345 678", "+855 12 345 678", "០១២៣៤៥៦៧៨", ""]) assert.equal(phoneCode(value), (gs as any).portalPhoneCode_(value));
  assert.throws(() => phoneCode("12ab"));
});
