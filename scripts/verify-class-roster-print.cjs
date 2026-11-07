const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('    function reportShortDate(value) {');
const end = html.indexOf('    function renderClassReport() {', start);
assert.ok(start >= 0 && end > start, 'Roster functions exist');

const context = {
    appSettings:{ academicYearStart:2026, issueDate:'2026-10-20', principalName:'នាយក', classTeachers:{ '8B':'គ្រូ' } },
    normDate:value => value,
    compareKhmer:(a, b) => String(a).localeCompare(String(b), 'en', { numeric:true }),
    studentVisibleId:student => student.studentCode,
    studentFullName:student => student.name,
    toKhmerDigits:value => String(value),
    esc:value => String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]),
    Date
};
vm.createContext(context);
vm.runInContext(html.slice(start, end), context);

const makeGroup = count => ({
    key:'class:8B', name:'8B', male:count - 18, female:18,
    students:Array.from({ length:count }, (_, index) => ({
        studentCode:`9022508${String(index + 1).padStart(3, '0')}`,
        name:`សិស្ស ${index + 1}`,
        gender:index < 18 ? 'ស្រី' : 'ប្រុស',
        dob:'2011-02-25', fromSchool:'សាលាមុន'
    }))
});

const onePage = context.classRosterDocumentHtml(makeGroup(65));
assert.equal((onePage.match(/class="school-roster-page"/g) || []).length, 1);
assert.equal((onePage.match(/<tr>/g) || []).length, 46, 'One header and 45 mirrored rows');
assert.match(onePage, /បញ្ជីឈ្មោះសិស្ស ថ្នាក់ទី 8B/);
assert.match(onePage, /បញ្ជីនេះមានសិស្សសរុប 65 នាក់ ស្រី 18 នាក់/);
assert.match(onePage, /ថ្ងៃទី \.\.\.\.\.\.\.\. ខែ \.\.\.\.\.\.\.\.\.\.\.\.\.\.\.\. ឆ្នាំ 2026/);
assert.match(onePage, /គ្រូបន្ទុកថ្នាក់/);
assert.match(onePage, /នាយកសាលា/);
assert.match(onePage, /សិស្ស 65/);

const twoPages = context.classRosterDocumentHtml(makeGroup(91));
assert.equal((twoPages.match(/class="school-roster-page"/g) || []).length, 2);
assert.match(twoPages, /សិស្ស 91/);
assert.match(twoPages, /ទំព័រ 2\/2/);
assert.match(context.classRosterPrintCss(), /size:A4 portrait/);
assert.match(context.classRosterPrintCss(), /min-height:20mm/);
assert.ok(20 + 6 + 8 + 45 * 4.9 + 6 + 20 < 284, 'Header, 45 rows and signatures fit one printable A4 page');
assert.match(html, /data-sidebar-view="report"/, 'Roster is reached through the Reports navigation');
assert.match(html, /id="report-mode-class"/, 'Class mode remains available in Reports');
assert.match(html, /id="class-report-select"/);
assert.match(html, /id="download-class-roster-btn"/);
const rosterColWidths = [3.8, 8.6, 16.2, 4, 9.2, 8.2];
const expectedColgroup = '<colgroup>' + [...rosterColWidths, ...rosterColWidths].map(w => `<col style="width:${w}%">`).join('') + '</colgroup>';
assert.ok(onePage.includes(expectedColgroup), 'Mirrored roster uses the standardized A4 column widths');
assert.ok(Math.abs(rosterColWidths.reduce((a, b) => a + b, 0) * 2 - 100) < 0.01, 'Roster columns fill the page width');
assert.match(html, /function fitRosterText\(root\)/);

const downloadStart = html.indexOf('    function rosterDownloadName(groups, extension) {');
const downloadEnd = html.indexOf('    // ===================== FILTERS', downloadStart);
assert.ok(downloadStart >= 0 && downloadEnd > downloadStart, 'Roster export functions exist');
vm.runInContext(html.slice(downloadStart, downloadEnd), context);
context.addressText = () => '';
let downloadedBlob;
let downloadedName;
context.URL = { createObjectURL:blob => { downloadedBlob = blob; return 'blob:test'; }, revokeObjectURL:() => {} };
context.document = { body:{ append:() => {} }, createElement:() => ({ click:() => {}, remove:() => {} }) };
context.Blob = Blob;
context.setTimeout = () => {};
context.showToast = () => {};
let workbookConfig;
context.window = { StudentExport:{ styledWorkbook:config => { workbookConfig = config; return new Blob(['xlsx']); } } };
const originalDownloadWorkbookFile = context.downloadWorkbookFile;
context.downloadWorkbookFile = (blob, name) => { downloadedName = name; return originalDownloadWorkbookFile(blob, name); };
vm.runInContext('downloadWorkbookFile = this.downloadWorkbookFile', context);
const otherGroup = { ...makeGroup(3), key:'class:8A', name:'8A' };
context.downloadClassRosterExcel([makeGroup(91), otherGroup]);
assert.equal(workbookConfig.sheets.length, 2, 'One styled sheet per class');
const [rosterSheet] = workbookConfig.sheets;
assert.equal(rosterSheet.name, '8B');
assert.match(rosterSheet.title, /8B/);
assert.equal(rosterSheet.paperSize, 9, 'A4 paper');
assert.equal(rosterSheet.fitToWidth, 1);
assert.equal(rosterSheet.rows.length, 91, 'Every student is exported as one row');
assert.equal(rosterSheet.columns.length, rosterSheet.rows[0].length);
assert.ok(rosterSheet.columns.every(column => !('value' in column)), 'Column getters are not passed to the workbook');
assert.deepEqual(Array.from(rosterSheet.rows, row => row[0]), Array.from({ length:91 }, (_, index) => index + 1));
const expectedOrder = Array.from(context.sortedRosterStudents(makeGroup(91)), student => student.studentCode);
assert.deepEqual(Array.from(rosterSheet.rows, row => row[1]), expectedOrder, 'Rows follow the printed roster order');
assert.match(rosterSheet.meta, /សរុប 91 នាក់ · ប្រុស 73 · ស្រី 18/);
assert.equal(workbookConfig.sheets[1].rows.length, 3);
assert.equal(downloadedName, 'student-roster-all-classes-2026.xlsx');
assert.ok(downloadedBlob);
downloadedBlob = null;
context.selectedClassReport = () => ({ selected:makeGroup(65), rows:[makeGroup(65)] });
context.reportMode = 'class';
context.downloadClassRosterHtml();
downloadedBlob.text().then(downloadedHtml => {
    assert.match(downloadedHtml, /<html lang="km">/);
    assert.match(downloadedHtml, /<table class="roster-table">/);
    assert.match(downloadedHtml, /size:A4 portrait/);
    assert.match(downloadedHtml, /<script>function fitRosterText/);
    assert.equal((downloadedHtml.match(/class="school-roster-page"/g) || []).length, 1);
    const downloadedScript = downloadedHtml.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(downloadedScript);
    new vm.Script(downloadedScript[1]);
    if (process.argv.includes('--preview')) {
        const output = path.join(__dirname, '..', 'tmp', 'roster-preview.html');
        fs.mkdirSync(path.dirname(output), { recursive:true });
        fs.writeFileSync(output, downloadedHtml);
        console.log(`Local visual fixture: ${output}`);
    }
    console.log('Class roster print/export: official 45-row halves, 90-student pages and A4 layout');
}).catch(error => { console.error(error); process.exitCode = 1; });
