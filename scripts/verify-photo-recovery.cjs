const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'google-sheet-backend.gs'), 'utf8');
// Minimal Apps Script fakes: recovered photos are now stored as private Drive files.
const driveFiles = new Map();
let nextFileId = 1;
const scriptProperties = new Map();
const fakeFolder = {
  getId: () => 'folder-0000000001',
  setDescription: () => {},
  createFile(blob) {
    const id = `photo-file-${String(nextFileId++).padStart(6, '0')}`;
    const file = { id, blob, description: '', getId: () => id, setDescription(text) { this.description = text; } };
    driveFiles.set(id, file);
    return file;
  }
};
const context = vm.createContext({
  console,
  Utilities: {
    base64Decode: text => Array.from(Buffer.from(text, 'base64')),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
    formatDate: () => '20261107-000000',
    getUuid: () => 'uuid-1234-5678'
  },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: key => scriptProperties.get(key) || null,
    setProperty: (key, value) => scriptProperties.set(key, value)
  }) },
  DriveApp: {
    createFolder: () => fakeFolder,
    getFolderById: () => fakeFolder,
    getFileById: id => driveFiles.get(id)
  }
});
vm.runInContext(source, context);
const headers = Array.from(vm.runInContext('HEADERS', context));
const viewFields = Array.from(vm.runInContext('VIEW_FIELDS', context));
const photoA = 'data:image/png;base64,AAAA';
const photoB = 'data:image/png;base64,BBBB';

function row(fields, columns) {
  return columns.map(key => fields[key] || '');
}

function sheet(name, rows) {
  return {
    getName: () => name,
    getLastRow: () => rows.length + 1,
    getRange(firstRow, firstColumn, height = 1, width = 1) {
      return {
        getValues: () => rows.slice(firstRow - 2, firstRow - 2 + height)
          .map(item => item.slice(firstColumn - 1, firstColumn - 1 + width)),
        setValue: value => { rows[firstRow - 2][firstColumn - 1] = value; }
      };
    }
  };
}

const masterRows = [
  row({ id:'id-1', studentCode:'STU-1', studentName:'សុខ ដារ៉ា', studentSurname:'សុខ', studentGivenName:'ដារ៉ា' }, headers),
  row({ id:'id-2', studentCode:'STU-2', studentName:'សុខ មុនី', photo:photoB }, headers)
];
const master = sheet('Students', masterRows);
const classRows = [row({ studentCode:'STU-1', studentSurname:'សុខ', studentGivenName:'ដារ៉ា', photo:photoA }, viewFields)];
const classSheet = sheet('Class - 7A', classRows);
context.testSheet = master;
context.testViews = [classSheet];
context.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheets: () => context.testViews }) };
vm.runInContext('getStudentsSheet_ = function() { return testSheet; }', context);

assert.equal(vm.runInContext('restoreMissingPhotos_([])', context), 1);
const restoredReference = masterRows[0][headers.indexOf('photo')];
assert.match(restoredReference, /^drive:photo-file-\d{6}$/, 'restored photo is saved to Drive, not inlined in the Sheet');
const restoredFile = driveFiles.get(restoredReference.slice('drive:'.length));
assert.equal(restoredFile.blob.mime, 'image/png');
assert.deepEqual(restoredFile.blob.bytes, Array.from(Buffer.from('AAAA', 'base64')));
assert.equal(JSON.parse(restoredFile.description).studentCode, 'STU-1');
assert.equal(scriptProperties.get('STUDENT_PHOTO_FOLDER_ID'), 'folder-0000000001');
assert.equal(masterRows[1][headers.indexOf('photo')], photoB);

masterRows[0][headers.indexOf('photo')] = '';
context.testViews = [classSheet, sheet('By Class', [row({ studentCode:'STU-1', studentSurname:'សុខ', studentGivenName:'ដារ៉ា', photo:photoB }, viewFields)])];
assert.equal(vm.runInContext('restoreMissingPhotos_([])', context), 0, 'conflicting photos must not be guessed');
assert.equal(masterRows[0][headers.indexOf('photo')], '');

const filesBefore = driveFiles.size;
context.testViews = [sheet('Class - 7A', [row({ studentCode:'STU-1', studentSurname:'សុខ', studentGivenName:'ដារ៉ា', photo:restoredReference }, viewFields)])];
assert.equal(vm.runInContext('restoreMissingPhotos_([])', context), 1, 'an existing Drive reference can be recovered');
assert.equal(masterRows[0][headers.indexOf('photo')], restoredReference, 'Drive references are reused as-is');
assert.equal(driveFiles.size, filesBefore, 'no duplicate Drive file is created');

context.testViews = [];
context.captured = null;
vm.runInContext('readStudents_ = function() { return [{id:"id-1",studentCode:"STU-1",photo:"drive:existing-file-0001"}]; }; writeStudents_ = function(rows) { captured = rows; }', context);
vm.runInContext('replaceStudents_([{id:"id-1",studentCode:"STU-1",photo:""}])', context);
assert.equal(context.captured[0].photo, 'drive:existing-file-0001', 'an import without a photo keeps the stored photo');

console.log('Photo recovery checks passed');
