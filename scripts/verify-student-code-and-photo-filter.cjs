// Local regression checks only: no network requests or Sheet writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptStart = html.indexOf('<script type="module">');
assert.ok(scriptStart >= 0);
const script = html.slice(scriptStart + '<script type="module">'.length, html.indexOf('</script>', scriptStart));
acorn.parse(script, { ecmaVersion:'latest', sourceType:'module' });

function section(from, to) {
    const start = html.indexOf(from);
    const end = html.indexOf(to, start + from.length);
    assert.ok(start >= 0 && end > start, `Missing ${from}`);
    return html.slice(start, end);
}

const codes = vm.createContext({
    SCHOOL_STUDENT_CODE:'902', appSettings:{academicYearStart:2026}, allStudents:[],
    GOOGLE_SHEET_PROVIDER:'google-sheet', getCloudProvider:() => 'google-sheet',
    hasGoogleScriptUrl:() => true, navigator:{onLine:true},
    readGoogleSheetJsonp:async () => ({ok:true, students:[
        {studentCode:'9022607001'}, {studentCode:'9022508002'}
    ]}), console, Date
});
vm.runInContext(section('    function classGrade(', '    // ===================== PHOTO & WEBCAM'), codes);
assert.equal(codes.classGrade('7A'), 7);
assert.equal(codes.classGrade('ថ្នាក់ទី៨ ខ'), 8);
assert.equal(codes.classGrade('១២ក'), 12);
assert.equal(codes.studentCodeStem('7A', 2026), '9022607');
assert.equal(codes.studentCodeStem('8B', 2026), '9022508');
assert.equal(codes.studentCodeStem('12A', 2026), '9022112');
assert.equal(codes.nextStudentCode('9022607', ['9022607001','9022607003','STU-0004']), '9022607004');
assert.equal(codes.studentCodeStem('6A', 2026), '');

(async () => {
    codes.allStudents = [{studentCode:'9022607002'}];
    assert.equal(await codes.generateStudentCode('7A'), '9022607003');
    assert.equal(await codes.generateStudentCode('8A'), '9022508003');
    codes.sharedStudentCodes = async () => ['9022607001', '9022508002'];
    vm.runInContext(section('    async function assignCodes(', '    async function importStudentObjects('), codes);
    const imported = await codes.assignCodes([
        {className:'7A',studentCode:''}, {className:'7B',studentCode:''},
        {className:'8A',studentCode:''}, {className:'9A',studentCode:'CUSTOM-9'}
    ]);
    assert.deepEqual(Array.from(imported, student => student.studentCode),
        ['9022607003', '9022607004', '9022508003', 'CUSTOM-9']);

    const duplicateCheck = vm.createContext({
        allStudents:[], normText:value => String(value || '').trim(),
        studentFullName:student => student.studentName || '', normDate:value => value || '',
        getCloudProvider:() => 'google-sheet', GOOGLE_SHEET_PROVIDER:'google-sheet',
        hasGoogleScriptUrl:() => true, navigator:{onLine:true},
        normalizeCloudStudent:student => student,
        sharedStudentIdentities:async () => [{id:'other',studentCode:'9022607001',studentName:'ឈ្មោះ ផ្សេង'}],
        console
    });
    vm.runInContext(section('    function normStudentFields(',
        '    // ===================== STUDENT CODE GENERATION ====================='), duplicateCheck);
    const candidate = {id:'new',studentCode:'9022607001',studentName:'ឈ្មោះ ថ្មី'};
    assert.equal((await duplicateCheck.findDuplicateOnServer(candidate, '', [], null))?.type, 'studentCode');
    assert.equal(await duplicateCheck.findDuplicateOnServer(candidate, '', [], null, {ignoreCode:true}), null,
        'a second phone may submit the same provisional code for server allocation');
    duplicateCheck.sharedStudentIdentities = async () => [
        {id:'other',studentCode:'9022607001',studentName:'ឈ្មោះ ថ្មី'}
    ];
    assert.equal((await duplicateCheck.findDuplicateOnServer(candidate, '', [], null,
        {ignoreCode:true}))?.type, 'studentName', 'server checks still reject duplicate names');

    const filter = vm.createContext({
        els:{
            searchInput:{value:''}, genderFilter:{value:''}, classFilter:{value:''},
            schoolFilter:{value:''}, photoFilter:{value:'missing'}, photoFilterStatus:{textContent:''}
        },
        allStudents:[
            {id:'a',studentCode:'9022607001',photo:''},
            {id:'b',studentCode:'9022607002',photo:''},
            {id:'c',studentCode:'9022607003',photo:''}
        ],
        filteredStudents:[], visibleStudents:[], missingPhotoCodes:null,
        missingPhotoRevision:'', missingPhotoLookup:null, lastGoogleDataRevision:'revision-1',
        GOOGLE_SHEET_PROVIDER:'google-sheet', getCloudProvider:() => 'google-sheet',
        hasGoogleScriptUrl:() => true, loadPendingCloudMutations:() => [],
        readGoogleSheetJsonp:async () => ({ok:true, revision:'revision-1', missingCodes:['9022607002']}),
        safePhotoSrc:value => value || '', normalizeSearchText:value => String(value || '').toLowerCase(),
        studentSearchText:() => '', isShowAll:() => true, renderStudentViews:() => {},
        currentPageIndex:0, pageSize:25, hasNextPage:false,
        showToast:() => {}, console, Map, Set
    });
    vm.runInContext(section('    function applyFilters(', '    // ===================== PAGER'), filter);
    filter.applyFilters();
    assert.equal(filter.filteredStudents.length, 0, 'unverified empty list must not mark every student missing');
    await filter.refreshMissingPhotoCodes();
    assert.deepEqual(Array.from(filter.filteredStudents, student => student.id), ['b']);
    assert.equal(filter.els.photoFilterStatus.textContent, 'គ្មានរូបថត 1 នាក់');
    filter.loadPendingCloudMutations = () => [{action:'upsert',student:{id:'a',photo:''}}];
    filter.applyFilters();
    assert.deepEqual(Array.from(filter.filteredStudents, student => student.id), ['b'],
        'a text-only pending edit must not imply the Sheet photo was deleted');
    filter.loadPendingCloudMutations = () => [{action:'upsert',student:{id:'b',photo:'new-upload'}}];
    filter.applyFilters();
    assert.equal(filter.filteredStudents.length, 0, 'a pending upload must not be reported as missing');
    filter.els.photoFilter.value = '';
    filter.applyFilters();
    assert.equal(filter.filteredStudents.length, 3);
    console.log('Student code and missing-photo filter checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
