const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const backend = fs.readFileSync('google-sheet-backend.gs', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(Boolean);
inlineScripts.forEach((source, index) => new vm.Script(source, { filename:`inline-${index}.js` }));
new vm.Script(backend, { filename:'google-sheet-backend.gs' });

const headers = ['id', 'studentCode', 'className', 'updatedAt', 'photo', 'studentName'];
function fakeSheet(rows) {
  return {
    rows,
    getLastRow() { return this.rows.length + 1; },
    getRange(row, column, count=1, width=1) {
      const sheet = this;
      return {
        getDisplayValues() { return sheet.rows.slice(row-2, row-2+count).map(item => item.slice(column-1, column-1+width).map(String)); },
        getDisplayValue() { return String(sheet.rows[row-2][column-1] || ''); },
        setValue(value) { sheet.rows[row-2][column-1] = value; }
      };
    },
    deleteRow(row) { this.rows.splice(row-2, 1); }
  };
}
const deleteSource = backend.slice(backend.indexOf('function deleteStudent_('), backend.indexOf('function moveStudentClass_('));
const moveSource = backend.slice(backend.indexOf('function moveStudentClass_('), backend.indexOf('function writeStudents_('));
let sheet = fakeSheet([
  ['record-a', '9022607001', '7A', 'old', 'photo-a', 'One'],
  ['record-b', '9022607002', '7A', 'old', 'photo-b', 'Two']
]);
const context = {
  HEADERS:headers,
  getStudentsSheet_:() => sheet,
  studentCodeGrade_:name => /^[7-9]|^1[0-2]/.test(name),
  allocateStudentCode_:() => '9022508001',
  studentCodeAcademicYear_:() => 2026
};
vm.createContext(context);
vm.runInContext(`${deleteSource}\n${moveSource}`, context);
assert.throws(() => context.deleteStudent_({ recordId:'wrong-id', studentCode:'9022607002' }), /mismatch/);
assert.equal(sheet.rows.length, 2, 'mismatched identity must not delete another student');
assert.equal(context.deleteStudent_({ recordId:'record-a', studentCode:'9022607001' }), true);
assert.deepEqual(sheet.rows.map(row => row[0]), ['record-b']);
const result = context.moveStudentClass_('record-b', { className:'8A', updatedAt:'new' });
assert.equal(result.studentCode, '9022508001');
assert.deepEqual(sheet.rows[0], ['record-b', '9022508001', '8A', 'new', 'photo-b', 'Two']);
sheet = fakeSheet([['duplicate', '1'], ['duplicate', '2']]);
assert.throws(() => context.deleteStudent_({ recordId:'duplicate' }), /Duplicate/);
assert.throws(() => context.moveStudentClass_('duplicate', { className:'8A' }), /Duplicate/);

assert.match(html, /if \(action === "delete"\) await confirmGoogleSheetDeletion\(student, studentId\)/);
assert.match(html, /if \(action === "moveclass"\)/);
assert.match(html, /stageCloudMutation\("moveclass"/);
assert.match(html, /if \(\["delete","moveclass"\]\.includes\(operation\.action\)\) return;/);
assert.match(html, /student:identityOnly \?/);
console.log('Delete and class transfer safety checks passed');
