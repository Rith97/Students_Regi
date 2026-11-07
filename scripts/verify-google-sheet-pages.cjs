// Exercise the Apps Script read endpoints without touching the live spreadsheet.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'google-sheet-backend.gs'), 'utf8');
const context = {
    PORTAL_ADMIN_REQUIRED_PROPERTY:'PORTAL_ADMIN_REQUIRED',
    ContentService: {
        MimeType:{ JSON:'json', JAVASCRIPT:'javascript' },
        createTextOutput(text) { return { text, setMimeType() { return this; } }; }
    },
    PropertiesService:{ getScriptProperties:() => ({ getProperty:() => '' }) }
};
vm.createContext(context);
vm.runInContext(source, context);
context.portalAdminCredential_ = () => null;
context.ensureMissingStudentCodes_ = () => 0;

const keys = Array.from(context.HEADERS || vm.runInContext('HEADERS', context));
const rows = Array.from({ length:3 }, (_, index) => {
    const values = keys.map(() => '');
    values[keys.indexOf('id')] = `id-${index + 1}`;
    values[keys.indexOf('studentCode')] = `STU-${index + 1}`;
    values[keys.indexOf('studentName')] = `សិស្ស ${index + 1}`;
    values[keys.indexOf('photo')] = 'data:image/png;base64,example';
    return values;
});
const readRanges = [];
context.getStudentsSheet_ = () => ({
    getLastRow:() => rows.length + 1,
    getRange(row, column, count, width) {
        const span = width || 1;
        readRanges.push({row, column, count:count || 1, width:span});
        const values = rows.slice(row - 2, row - 2 + (count || 1)).map(record => record.slice(column - 1, column - 1 + span));
        return {
            getValues:() => values, getDisplayValues:() => values, getValue:() => values[0]?.[0],
            setValues:replacement => { replacement.forEach((record, index) => { rows[row - 2 + index] = record; }); }
        };
    },
    deleteRow(row) { rows.splice(row - 2, 1); }
});
context.readAppSettings_ = () => ({ principalName:'Test', academicYearStart:2026 });
context.getRevision_ = () => 'revision-1';

const get = params => JSON.parse(context.doGet({ parameter:params }).text);
const status = get({ action:'status' });
assert.equal(status.capabilities.studentLatinName, true);
const first = get({ action:'listpage', offset:'0', limit:'2' });
assert.ok(first.ok, JSON.stringify(first));
readRanges.length = 0;
const compact = get({ action:'listpage', offset:'0', limit:'2', includePhotos:'0' });
const photoColumn = keys.indexOf('photo') + 1;
assert.equal(readRanges.some(range => range.column <= photoColumn && range.column + range.width > photoColumn), false);
const last = get({ action:'listpage', offset:'2', limit:'2' });
const identities = get({ action:'identities' });
const studentStatus = get({ action:'studentstatus', studentId:'id-2' });
readRanges.length = 0;
const photos = get({ action:'photos', studentIds:'id-2,STU-3' });
const photosAfterTwelveKeys = get({ action:'photos', studentIds:[...Array.from({length:12}, (_, i) => `missing-${i}`), 'STU-3'].join(',') });
assert.ok(photosAfterTwelveKeys.ok, JSON.stringify(photosAfterTwelveKeys));
assert.equal(photosAfterTwelveKeys.students.length, 1);
assert.equal(photosAfterTwelveKeys.students[0].studentCode, 'STU-3');
assert.equal(readRanges.filter(range => range.column === photoColumn).length, 3);
assert.equal(readRanges.some(range => range.column === photoColumn && range.count > 1), false);
assert.equal(first.ok, true);
assert.equal(first.total, 3);
assert.equal(first.students.length, 2);
assert.equal(first.students[0].photo, 'data:image/png;base64,example');
assert.equal(compact.students[0].photo, '');
assert.equal(first.settings.principalName, 'Test');
assert.equal(last.students.length, 1);
assert.equal(last.settings, undefined);
assert.equal(identities.students.length, 3);
assert.equal(identities.students[0].photo, undefined);
assert.equal(studentStatus.recordId, 'id-2');
assert.equal(studentStatus.studentCode, 'STU-2');
assert.equal(photos.students.length, 2);
assert.equal(photos.students[0].photo, 'data:image/png;base64,example');
readRanges.length = 0;
context.upsertStudent_({id:'id-1', studentCode:'STU-1', studentName:'សិស្ស 1', photo:'', contact:'012'});
assert.equal(rows[0][keys.indexOf('photo')], 'data:image/png;base64,example');
assert.equal(rows[0][keys.indexOf('contact')], '012');
assert.equal(readRanges.filter(range => range.column <= photoColumn && range.column + range.width > photoColumn).length, 2);
assert.equal(readRanges.filter(range => range.column <= photoColumn && range.column + range.width > photoColumn).every(range => range.count === 1), true);
readRanges.length = 0;
context.deleteStudent_('id-1');
assert.equal(rows.length, 2);
assert.equal(readRanges.some(range => range.column <= photoColumn && range.column + range.width > photoColumn), false);
console.log('Paged Sheet reads and lightweight identities passed');
