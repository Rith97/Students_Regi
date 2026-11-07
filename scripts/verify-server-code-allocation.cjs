// Offline Apps Script regression: synthetic rows only, never touches a Sheet.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'google-sheet-backend.gs'), 'utf8');
const context = vm.createContext({ console, Date, Set });
vm.runInContext(source, context);
context.readAppSettings_ = () => ({ academicYearStart:2026 });
const headers = Array.from(vm.runInContext('HEADERS', context));
const row = (id, studentCode, className, studentName) => headers.map(key => ({
    id, studentCode, className, studentName, updatedAt:'2026-09-28T00:00:00.000Z'
})[key] || '');
const rows = [
    row('student-1', '9022607001', '7A', 'សិស្ស មួយ'),
    row('student-2', '9022508001', '8A', 'សិស្ស ពីរ')
];
let gridRows = 999;
const sheet = {
    getLastRow:() => rows.length + 1,
    getMaxRows:() => gridRows,
    insertRowsAfter:(_after, count) => { gridRows += count; },
    getRange(firstRow, firstColumn, count=1, width=1) {
        const read = () => Array.from({length:count}, (_, n) =>
            Array.from({length:width}, (_, k) => rows[firstRow - 2 + n]?.[firstColumn - 1 + k] || ''));
        return {
            getValues:read, getDisplayValues:read,
            setValues(values) {
                values.forEach((cells, n) => { rows[firstRow - 2 + n] = cells.slice(); });
            }
        };
    }
};
context.getStudentsSheet_ = () => sheet;
context.ensureRows_(sheet, 1601);
assert.equal(gridRows, 1601, 'the student grid grows beyond its original 999 rows');

assert.equal(context.studentCodeStem_('7A', 2026), '9022607');
assert.equal(context.studentCodeStem_('ថ្នាក់ទី៨ ខ', 2026), '9022508');
assert.equal(context.studentCodeStem_('9F', 2026), '9022409');
assert.equal(context.allocateStudentCode_('7A', '', ['9022607001'], 2026), '9022607002');

context.upsertStudent_({id:'student-3', studentCode:'9022607002', className:'7B', studentName:'សិស្ស បី'});
context.upsertStudent_({id:'student-4', studentCode:'9022607002', className:'7C', studentName:'សិស្ស បួន'});
assert.equal(rows[2][headers.indexOf('studentCode')], '9022607002');
assert.equal(rows[3][headers.indexOf('studentCode')], '9022607003',
    'two phones using the same provisional code receive distinct final codes');

context.upsertStudent_({id:'student-3', studentCode:'STU-OLD', className:'7B', studentName:'សិស្ស បី'});
assert.equal(rows[2][headers.indexOf('studentCode')], '9022607002',
    'a stale phone edit cannot restore an old code');
assert.equal(rows[0][headers.indexOf('studentCode')], '9022607001');

const normalized = context.normalizeStudentCodes_([
    {id:'a', studentCode:'9022409001', className:'9A'},
    {id:'b', studentCode:'90226-001', className:'9B'},
    {id:'c', studentCode:'9022409001', className:'9C'},
    {id:'d', studentCode:'STU-0055', className:''}
]);
assert.deepEqual(Array.from(normalized, student => student.studentCode),
    ['9022409001','9022409002','9022409003','STU-0055']);
console.log('Server student-code allocation and stale-client protection passed');
