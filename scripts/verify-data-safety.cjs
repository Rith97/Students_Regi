// Regression tests use fake records and mocked endpoints only; no network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function section(from, to) {
    const start = html.indexOf(from);
    const end = html.indexOf(to, start + from.length);
    assert.ok(start >= 0 && end > start, `Missing production section ${from}`);
    return html.slice(start, end);
}
const photoCode = section('    function googlePhotoKey(', '    function loadPendingCloudMutations(');
function photoContext() {
    const context = vm.createContext({
        console, setTimeout, Date,
        pendingGooglePhotos:new Map(), googlePhotoResults:new Map(), localPhotoLookups:new Set(), googlePhotoQueue:Promise.resolve(),
        visiblePhotoRefreshScheduled:false, lastGoogleDataRevision:'r1', localStudentWriteVersion:0, SHARED_DATA_REFRESH_MS:20000,
        GOOGLE_SHEET_PROVIDER:'google', getCloudProvider:() => 'google', hasGoogleScriptUrl:() => true,
        safePhotoSrc:value => value || '', cacheStudentPhoto:async () => true, forgetStudentPhoto:async () => {},
        loadPendingCloudMutations:() => [], saveToLocalStorage:async () => {}, allStudents:[],
        document:{ body:{ classList:{ contains:() => false } } }, window:{addEventListener:() => {}},
        els:{studentList:{querySelectorAll:() => []}, editingId:{value:''}}, getValue:() => '', setPhotoPreview:() => {},
        isMobileView:() => false, innerHeight:800,
        restoreStudentPhoto:async student => student,
        requestAnimationFrame:fn => setTimeout(fn, 0), visibleStudents:[], renderStudentViews:() => {},
    });
    vm.runInContext(photoCode, context);
    return context;
}
async function waitFor(predicate) {
    for (let i = 0; i < 200; i++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Deferred photo test timed out');
}
(async () => {
    const cacheKeys = vm.createContext({
        allStudents:[{id:'a', studentCode:'DUP'}, {id:'b', studentCode:'DUP'}],
        studentPhotoCacheKey:student => student.id || student.studentCode
    });
    vm.runInContext(section('    function studentCodeIsUnique(', '    async function cacheStudentPhoto('), cacheKeys);
    assert.deepEqual(Array.from(cacheKeys.studentPhotoCacheKeys(cacheKeys.allStudents[0])), ['record-photo-v2:a']);

    // Loading a visible batch must not read photos below the viewport.
    const c = photoContext();
    c.allStudents = Array.from({length:9}, (_, n) => ({id:`student-${n}`, photo:''}));
    c.visibleStudents = c.allStudents;
    let visibleIds = c.allStudents.slice(0, 8).map(student => student.id);
    c.els.studentList.querySelectorAll = () => visibleIds.map(id => ({
        dataset:{id}, getBoundingClientRect:() => ({width:40, height:40, top:0, bottom:40})
    }));
    let calls = 0;
    c.readGoogleSheetJsonp = async params => {
        calls++;
        return {ok:true, students:params.studentIds.split(',').map(id => ({id, photo:id === 'student-8' ? 'photo-8' : ''}))};
    };
    c.hydrateVisibleStudentPhotos();
    await waitFor(() => calls === 1 && !c.visiblePhotoRefreshScheduled);
    assert.equal(c.allStudents[8].photo, '');
    visibleIds = [c.allStudents[8].id];
    c.hydrateVisibleStudentPhotos();
    await waitFor(() => c.allStudents[8].photo === 'photo-8' && !c.visiblePhotoRefreshScheduled);
    assert.equal(calls, 2);

    // A print/edit request joins the in-flight thumbnail request, then waits.
    const d = photoContext();
    d.allStudents = [{id:'one', photo:''}];
    let release;
    d.readGoogleSheetJsonp = () => new Promise(resolve => { release = resolve; });
    const first = d.hydrateStudentPhotosFromSheet(d.allStudents);
    let secondFinished = false;
    const second = d.hydrateStudentPhotosFromSheet(d.allStudents, 8, {strict:true}).then(() => { secondFinished = true; });
    await waitFor(() => release);
    assert.equal(secondFinished, false);
    release({ok:true, students:[{id:'one', photo:'portrait'}]});
    await Promise.all([first, second]);
    assert.equal(d.allStudents[0].photo, 'portrait');

    // A late server response cannot overwrite a newly uploaded portrait.
    d.allStudents = [{id:'two', photo:''}];
    release = null;
    const late = d.hydrateStudentPhotosFromSheet(d.allStudents);
    await waitFor(() => release);
    d.allStudents[0].photo = 'new-upload';
    release({ok:true, students:[{id:'two', photo:'old-portrait'}]});
    await late;
    assert.equal(d.allStudents[0].photo, 'new-upload');

    // A different record ID cannot borrow a photo even when the code matches.
    const legacy = photoContext();
    legacy.allStudents = [{id:'old-local-id', studentCode:'STU-99', photo:''}];
    let requestedKeys = '';
    legacy.readGoogleSheetJsonp = async params => {
        requestedKeys = params.studentIds;
        return {ok:true, students:[{id:'new-sheet-id', studentCode:'STU-99', photo:'matched-photo'}]};
    };
    await assert.rejects(legacy.hydrateStudentPhotosFromSheet(legacy.allStudents, 1, {strict:true}));
    assert.equal(legacy.allStudents[0].photo, '');
    assert.equal(requestedKeys, 'old-local-id,STU-99');

    const ambiguous = photoContext();
    ambiguous.allStudents = [{id:'old-local-id', studentCode:'STU-99', photo:''}];
    ambiguous.readGoogleSheetJsonp = async () => ({ok:true, students:[
        {id:'other-1', studentCode:'STU-99', photo:'wrong-1'},
        {id:'other-2', studentCode:'STU-99', photo:'wrong-2'}
    ]});
    await assert.rejects(ambiguous.hydrateStudentPhotosFromSheet(ambiguous.allStudents, 1, {strict:true}));
    assert.equal(ambiguous.allStudents[0].photo, '');

    // Failed photo loads cool down in the list; explicit print can retry.
    const f = photoContext();
    f.allStudents = [{id:'retry', photo:''}];
    f.readGoogleSheetJsonp = async () => { throw new Error('offline'); };
    await assert.rejects(f.hydrateStudentPhotosFromSheet(f.allStudents, 8, {strict:true}));
    assert.equal(f.needsGooglePhoto(f.allStudents[0]), false);
    f.readGoogleSheetJsonp = async () => ({ok:true, students:[{id:'retry', photo:'restored'}]});
    await f.hydrateStudentPhotosFromSheet(f.allStudents, 8, {strict:true});
    assert.equal(f.allStudents[0].photo, 'restored');

    // Honor a backend's smaller page limit instead of silently skipping rows.
    const paging = vm.createContext({
        GOOGLE_SHEET_PAGE_SIZE:64, console,
        readGoogleSheetPage:async offset => ({ok:true, total:5, limit:2, revision:'r', settingsRevision:'s',
            students:Array.from({length:Math.min(2, 5-offset)}, (_, n) => ({id:offset+n}))}),
        readGoogleSheetJsonp:async () => ({ok:true, revision:'r', settingsRevision:'s'})
    });
    vm.runInContext(section('    async function readGoogleSheetStudents(', '    function rememberGoogleSheetRevisions('), paging);
    assert.deepEqual(Array.from((await paging.readGoogleSheetStudents()).students, row => row.id), [0,1,2,3,4]);

    // Do not commit a cloud snapshot after an intervening local write.
    const safety = vm.createContext({
        googleSheetLoadsInFlight:0, localStudentWriteVersion:0, hasGoogleScriptUrl:() => true,
        setCloudControlsLoading:() => {}, setStatus:() => {},
        readGoogleSheetStudents:async () => {
            safety.localStudentWriteVersion++;
            return {ok:true, students:[{id:'old'}]};
        },
        applySharedAppSettings:() => {}, normalizeCloudStudent:row => row,
        safePhotoSrc:value => value || '',
        els:{photoFilter:{value:''}},
        loadHydratedPendingMutations:async () => [], applyPendingMutationsToStudents:rows => rows,
        rememberGoogleSheetRevisions:() => { throw new Error('Stale response must not be committed'); },
        allStudents:[{id:'new-local'}], console
    });
    vm.runInContext(section('    async function loadStudentsFromGoogleSheet(', '    function loadStudentsFromCloudStorage('), safety);
    assert.equal(await safety.loadStudentsFromGoogleSheet(), false);
    assert.equal(safety.allStudents[0].id, 'new-local');
    assert.equal(safety.googleSheetLoadsInFlight, 0);

    // Slow cache writes cannot overwrite a newer local save.
    let finishOldCache;
    let storedRows;
    const storage = vm.createContext({
        localStudentWriteVersion:0, LOCAL_STUDENTS_KEY:'test',
        rememberStudentPhotos:rows => rows[0].id === 'old'
            ? new Promise(resolve => { finishOldCache = resolve; }) : Promise.resolve(true),
        hasCloudStorageConfig:() => true,
        writeStudentSnapshot:async () => true,
        localStorage:{setItem:(_key, value) => { storedRows = JSON.parse(value); }}, console
    });
    vm.runInContext(section('    async function saveToLocalStorage(', '    function studentPhotoCacheKey('), storage);
    const oldSave = storage.saveToLocalStorage([{id:'old'}]);
    await storage.saveToLocalStorage([{id:'new'}]);
    finishOldCache(true);
    await oldSave;
    assert.equal(storedRows[0].id, 'new');

    const filters = vm.createContext({hasActiveFilters:() => true, filteredStudents:[1,2,3], visibleStudents:[1], allStudents:[1,2,3,4]});
    vm.runInContext(section('    function printableRows(', '    function toKhmerDigits('), filters);
    assert.deepEqual(Array.from(filters.printableRows()), [1,2,3]);

    // Cached browser portraits are unverified until the Sheet supplies them.
    const cachedLoad = vm.createContext({
        LOCAL_STUDENTS_KEY:'test', GOOGLE_SHEET_PROVIDER:'google', console,
        localStorage:{getItem:() => JSON.stringify([{id:'blank-on-sheet',photo:'old-cache'}])},
        readStudentSnapshot:async () => null, loadHydratedPendingMutations:async () => [],
        normalizeStudentIdentity:student => student,
        getCloudProvider:() => 'google', hasGoogleScriptUrl:() => true,
        applyPendingMutationsToStudents:students => students
    });
    vm.runInContext(section('    async function loadFromLocalStorage(', '    async function saveToLocalStorage('), cachedLoad);
    assert.equal((await cachedLoad.loadFromLocalStorage())[0].photo, '');

    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(30000);
    const signature = `${photo.length}:${photo.slice(0, 64)}:${photo.slice(-64)}`;
    const storageValues = new Map();
    const pending = vm.createContext({
        cachedPhotoSignatures:new Map(Array.from({length:1600}, (_, n) => [`record-photo-v2:row-${n}`, signature])),
        studentPhotoCacheKeys:student => [`record-photo-v2:${student.id}`],
        safePhotoSrc:value => value || '', cachedStudentPhoto:async () => photo,
        localStorage:{setItem:(key, value) => storageValues.set(key, value), removeItem:key => storageValues.delete(key)},
        PENDING_CLOUD_MUTATIONS_STORAGE_KEY:'pending', pendingCloudMutations:0,
        showToast:() => {}, console
    });
    vm.runInContext(section('    function externalizeMutationPhotos(', '    function loadHistoryFromLocalStorage('), pending);
    const largeBatch = [{id:'mutation-1',action:'upsertmany',student:{},
        students:Array.from({length:1600}, (_, n) => ({id:`row-${n}`,studentName:`Student ${n}`,photo}))}];
    assert.equal(pending.savePendingCloudMutations(largeBatch), true);
    assert.ok(storageValues.get('pending').length < 250000,
        '1,600 pending photos must not fill localStorage');
    const storedBatch = JSON.parse(storageValues.get('pending'))[0];
    assert.equal(storedBatch.students[1599].photo, '');
    assert.equal(storedBatch.students[1599].photoCacheRequired, true);
    await pending.hydrateMutationPhotos({student:{},students:[storedBatch.students[1599]]});
    assert.equal(storedBatch.students[1599].photo, photo);

    const queued = vm.createContext({
        normalizeCloudStudent:student => student, pendingStudentKey:student => student.id || student.studentCode || '',
        normText:value => String(value || '').trim(), studentFullName:student => student.studentName || '',
        normalizeStudentIdentity:student => student
    });
    vm.runInContext(section('    function mergeQueuedStudent(', '    function applyPendingMutationsToStudents('), queued);
    const rows = [];
    queued.mergeQueuedStudent(rows, {id:'phone-1',studentCode:'9022607001',studentName:'First'});
    queued.mergeQueuedStudent(rows, {id:'phone-2',studentCode:'9022607001',studentName:'Second'});
    assert.equal(rows.length, 2, 'two phones with the same provisional code remain separate records');

    const editPhoto = vm.createContext({
        GOOGLE_SHEET_PROVIDER:'google', getCloudProvider:() => 'google', hasGoogleScriptUrl:() => true,
        photoSelectedByUser:false, safePhotoSrc:value => value || '', cachedStudentPhoto:async () => 'old-cache'
    });
    vm.runInContext(section('    async function studentEditPhoto(', '    async function handleFormSubmit('), editPhoto);
    assert.equal(await editPhoto.studentEditPhoto('old-cache', {id:'a',photo:'old-cache'}, 'a'), '',
        'a text-only edit must not re-upload an old cached photo');
    editPhoto.photoSelectedByUser = true;
    assert.equal(await editPhoto.studentEditPhoto('new-camera-photo', {id:'a',photo:'old-cache'}, 'a'), 'new-camera-photo',
        'a new explicit camera/upload photo must still save');
    console.log('Data safety passed: lazy photos, shared requests, upload preservation, retry, pagination, stale-load protection, filtered print.');
})().catch(error => { console.error(error); process.exitCode = 1; });
