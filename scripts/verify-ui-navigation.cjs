const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sidebar = html.match(/<nav class="topbar-actions"[\s\S]*?<\/nav>/)?.[0];
const report = html.match(/<section id="report-view"[\s\S]*?<\/section>/)?.[0];
const mobileMenu = html.match(/<div id="mobile-actions-sheet"[\s\S]*?<dialog id="card-export-dialog"/)?.[0];
const settings = html.match(/<div id="app-settings-modal"[\s\S]*?<div id="sheet-modal"/)?.[0];
assert.ok(sidebar && report && mobileMenu && settings, 'Navigation, reports and settings sections exist');

assert.equal((sidebar.match(/data-sidebar-view="(?:form|list|classes|report)"/g) || []).length, 4);
assert.equal((sidebar.match(/<details class="action-group advanced-actions"/g) || []).length, 1);
// Sidebar groups, in order: students, documents, data, administration, then collapsed maintenance.
assert.deepEqual([...sidebar.matchAll(/class="action-group[^"]*"[^>]*?(?:data-group-label="([^"]+)"|aria-label="([^"]+)")/g)].map(match => match[1] || match[2]),
    ['សិស្ស', 'ឯកសារ', 'ទិន្នន័យ', 'រដ្ឋបាល', 'ថែទាំប្រព័ន្ធ']);
assert.deepEqual([...sidebar.matchAll(/data-sidebar-view="(\w+)"/g)].map(match => match[1]), ['list', 'form', 'classes', 'report'],
    'Student work comes first, reports after');
const dataGroup = sidebar.slice(sidebar.indexOf('data-group-label="ទិន្នន័យ"'), sidebar.indexOf('data-group-label="រដ្ឋបាល"'));
for (const id of ['load-sheet-btn', 'backup-now-btn', 'import-file-btn', 'download-template-btn']) {
    assert.match(dataGroup, new RegExp(`id="${id}"`), `${id} is a visible data action`);
}
const maintenance = sidebar.slice(sidebar.indexOf('<details class="action-group advanced-actions"'));
for (const id of ['recover-photos-btn', 'migrate-photos-btn', 'delete-all-btn']) {
    assert.match(maintenance, new RegExp(`id="${id}"`), `${id} stays under maintenance`);
}
assert.equal((mobileMenu.match(/<details class="mobile-action-group(?: mobile-danger-group)?"/g) || []).length, 3,
    'Phone menu groups: data, maintenance, danger');
assert.match(mobileMenu, /class="sheet-menu-item" href="[^"]*action=teacherportal"/, 'Teacher portal is reachable from the phone menu');
assert.match(mobileMenu, /id="mobile-actions-close-btn"[^>]*aria-label="បិទម៉ឺនុយសកម្មភាព"/);
assert.match(mobileMenu, /<details class="mobile-action-group mobile-danger-group">[\s\S]*?id="m-delete-all-btn"/);
assert.doesNotMatch(mobileMenu, /id="m-(?:print|download-photos|download-csv)/,
    'Print and export actions live in Reports, not the mobile menu');
assert.match(sidebar, /<div class="advanced-danger-zone">[\s\S]*?id="delete-all-btn"/);
assert.match(html, /id="mobile-menu-btn"[^>]*aria-controls="mobile-actions-sheet"[^>]*aria-expanded="false"/);
assert.match(mobileMenu, /id="mobile-actions-sheet"[^>]*aria-hidden="true" inert/);
assert.doesNotMatch(sidebar, /id="sheet-settings-btn"/, 'Storage is no longer a duplicate top-level desktop action');
assert.doesNotMatch(mobileMenu, /id="m-sheet-settings-btn"/, 'Storage is no longer a duplicate top-level mobile action');
assert.match(settings, /id="sheet-settings-btn"[^>]*class="settings-storage-link"/);
for (const [name, panel] of [['card', 'settings-card-panel'], ['school', 'settings-school-panel'], ['teachers', 'teacher-settings-section']]) {
    assert.match(settings, new RegExp(`id="settings-${name}-tab"[^>]*role="tab"[^>]*data-settings-tab="${name}"[^>]*aria-controls="${panel}"`));
    assert.match(settings, new RegExp(`id="${panel}"[^>]*role="tabpanel"`));
}
assert.match(settings, /id="settings-school-panel"[^>]*hidden/);
assert.match(settings, /id="teacher-settings-section"[^>]*hidden[\s\S]*?<input id="teacher-settings-search"[\s\S]*?<div id="teacher-settings-list"/);
assert.match(settings, /id="app-settings-title"[^>]*tabindex="-1"/);
assert.match(html, /<details id="alternate-storage-settings" class="storage-provider-advanced">[\s\S]*?id="storage-provider-select"/,
    'Alternative storage is available under a clearly labeled advanced section');
assert.match(html, /id="storage-test-result"[^>]*role="status"[^>]*hidden/,
    'Draft connection test has a persistent result inside Settings');
assert.match(html, /\.settings-tabs \{ position:sticky;/, 'Settings categories remain available while scrolling');
assert.match(html, /<details class="panel history-panel"[\s\S]*?<summary class="panel-header">/, 'Activity history is available without cluttering the roster');
assert.doesNotMatch(html, /class="admin-overview-actions"/, 'Duplicate dashboard shortcuts removed');
assert.doesNotMatch(html, /id="(?:m-)?print-name-list-btn"/, 'Class roster shortcut is not duplicated outside Reports');
assert.match(html, /function setSidebarActiveView\(view\)/);
assert.match(html, /id="clear-filters-btn"[^>]*hidden/);
assert.match(html, /id="active-filter-count"[^>]*hidden/);
assert.match(html, /id="toggle-filters-btn"[^>]*aria-controls="toolbar-filters"[^>]*aria-expanded="false"/);
assert.match(html, /id="toggle-table-detail-btn"[^>]*aria-controls="students-table"[^>]*aria-pressed="false"/,
    'The desktop roster starts in a concise view with an explicit full-details control');
assert.match(html, /<table id="students-table" class="compact-view">/);
assert.match(html, /#students-table\.compact-view thead tr:nth-child\(2\)/);
assert.match(html, /<details id="family-details" class="family-details">[\s\S]*?<summary>ព័ត៌មានឪពុក ម្តាយ និងអាណាព្យាបាល<\/summary>/,
    'Optional family details remain available without filling the initial form');
for (const step of ['២', '៣']) {
    assert.match(html, new RegExp(`<div class="form-section section-collapsed" data-step="${step}">\\s*<div class="section-header"[^>]*aria-expanded="false"`),
        `Address section ${step} starts collapsed but accessible`);
}
assert.match(html, /els\.registrationForm\.addEventListener\("invalid", event => \{[\s\S]*?setFormSectionExpanded\(event\.target\.closest\("\.form-section"\), true\)/,
    'Validation reveals any hidden invalid form field');
assert.match(html, /document\.getElementById\("family-details"\)\.open = \["fatherName"[\s\S]*?\.some\(key => Boolean\(s\[key\]\)\)/,
    'Editing a student reveals stored family information');
assert.match(html, /@media \(min-width: 861px\) \{[\s\S]*?\.main-layout\.show-list \.form-panel,\s*\.main-layout\.show-form \.list-panel \{ display:none; \}/,
    'Desktop shows one primary work panel at a time');
const editSource = html.slice(html.indexOf('    async function loadStudentIntoForm(id) {'), html.indexOf('    function setSaving(', html.indexOf('    async function loadStudentIntoForm(id) {')));
assert.match(editSource, /if \(isMobileView\(\)\) \{\s*openMobileEditPanel\(\);\s*\} else \{\s*setActiveTab\("form", \{ scroll:false \}\)/,
    'Editing from desktop list opens the form view');
const submitSource = html.slice(html.indexOf('    async function handleFormSubmit(e) {'), html.indexOf('    function openDeleteModal(', html.indexOf('    async function handleFormSubmit(e) {')));
assert.match(submitSource, /if \(isMobileView\(\) \|\| editingId\) setActiveTab\("list", \{ scroll: !editingId \}\)/,
    'Editing returns to the list after save');
const escapeSource = html.slice(html.indexOf('        document.addEventListener("keydown",e=>{'), html.indexOf('        // Local Offline Setup', html.indexOf('        document.addEventListener("keydown",e=>{')));
assert.ok(escapeSource.indexOf('els.appSettingsModal.classList.contains("is-open")') < escapeSource.indexOf('setActionsOpen(false)'),
    'Escape closes Settings before collapsing the sidebar');
assert.match(escapeSource, /if\(els\.editingId\.value\)\{resetForm\(\);if\(!isMobileView\(\)\)setActiveTab\("list"\);return;\}/,
    'Escape returns from desktop edit to the list');

for (const id of [
    'app-settings-btn', 'load-sheet-btn', 'backup-now-btn',
    'recover-photos-btn', 'download-template-btn', 'import-file-btn',
    'delete-all-btn'
]) {
    assert.equal((sidebar.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} remains available once`);
}
for (const id of ['print-list-btn', 'print-photo-list-btn', 'print-card-list-btn', 'download-photos-btn', 'download-csv-btn']) {
    assert.equal((report.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} is available in Reports`);
    assert.doesNotMatch(sidebar, new RegExp(`id="${id}"`), `${id} is not duplicated in the sidebar`);
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} exists once in the app`);
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).filter(Boolean);
assert.ok(scripts.length, 'Inline app script exists');
scripts.forEach((source, index) => new vm.Script(source, { filename:`inline-${index}.js` }));

const filterSource = html.slice(html.indexOf('    function filterTeacherSettings() {'), html.indexOf('    function openAppSettings() {'));
const tabSource = html.slice(html.indexOf('    function selectSettingsTab(name, focus=false) {'), html.indexOf('    function openAppSettings() {'));
const tabControl = () => ({ attributes:{}, tabIndex:-1, setAttribute(name, value) { this.attributes[name] = value; }, focus() { this.focused = true; } });
const tabPanel = () => ({ hidden:true });
const tabEls = {
    settingsCardTab:tabControl(), settingsSchoolTab:tabControl(), settingsTeachersTab:tabControl(),
    settingsCardPanel:tabPanel(), settingsSchoolPanel:tabPanel(), teacherSettingsSection:tabPanel()
};
const tabContext = vm.createContext({ els:tabEls });
vm.runInContext(tabSource, tabContext);
tabContext.selectSettingsTab('teachers', true);
assert.deepEqual([tabEls.settingsCardPanel.hidden, tabEls.settingsSchoolPanel.hidden, tabEls.teacherSettingsSection.hidden], [true, true, false]);
assert.equal(tabEls.settingsTeachersTab.attributes['aria-selected'], 'true');
assert.equal(tabEls.settingsTeachersTab.focused, true);
tabContext.selectSettingsTab('card');
assert.deepEqual([tabEls.settingsCardPanel.hidden, tabEls.settingsSchoolPanel.hidden, tabEls.teacherSettingsSection.hidden], [false, true, true]);
const saveSource = html.slice(html.indexOf('    async function saveAppSettings() {'), html.indexOf('    // ===================== STATUS', html.indexOf('    async function saveAppSettings() {')));
assert.match(saveSource, /querySelectorAll\("input\[data-class-name\]"\)/, 'Saving reads every teacher input, including search-hidden rows');
assert.match(saveSource, /if \(!els\.academicYearStartInput\.checkValidity\(\)\) \{\s*selectSettingsTab\("card"\)/, 'Invalid academic year opens its visible tab');

const storageSource = html.slice(html.indexOf('    function openSheetModal() {'), html.indexOf('    function clearCloudSettings(', html.indexOf('    function openSheetModal() {')));
const classList = () => {
    const values = new Set();
    return { add:value => values.add(value), remove:value => values.delete(value), contains:value => values.has(value) };
};
const draft = { value:'unsaved principal name' };
const storageEls = {
    appSettingsModal:{ classList:classList() }, sheetModal:{ classList:classList() },
    alternateStorageSettings:{ open:false }, storageTestResult:{ hidden:true, textContent:'', dataset:{} },
    storageProviderSelect:{ value:'' }, supabaseUrlInput:{ value:'' }, supabaseKeyInput:{ value:'' },
    sheetUrlInput:{ value:'' }, sheetAccessKeyInput:{ value:'' },
    settingsStorageStatus:{ textContent:'' }, sheetSettingsBtn:{ focus() { this.focused = true; } },
    appSettingsBtn:{ focus() {} }, mobileMenuBtn:{ focus() {} }, principalNameInput:draft
};
storageEls.appSettingsModal.classList.add('is-open');
const storageContext = vm.createContext({
    els:storageEls, storageReturnToSettings:false, getCloudProvider:() => 'google-sheet',
    SUPABASE_PROVIDER:'supabase', clearStorageTestResult:() => {},
    getSupabaseUrl:() => '', getSupabaseAnonKey:() => '', getGoogleScriptUrl:() => 'https://example.test/exec',
    getGoogleSheetAccessKey:() => '', currentStorageName:() => 'Google Sheet',
    updateStorageFieldsVisibility:() => {}, setTimeout:() => {}, isMobileView:() => false
});
vm.runInContext(storageSource, storageContext);
storageContext.openSheetModal();
assert.equal(storageEls.appSettingsModal.classList.contains('is-open'), false);
assert.equal(storageEls.sheetModal.classList.contains('is-open'), true);
storageContext.closeSheetModal();
assert.equal(storageEls.appSettingsModal.classList.contains('is-open'), true);
assert.equal(storageEls.sheetModal.classList.contains('is-open'), false);
assert.equal(draft.value, 'unsaved principal name', 'Storage round-trip preserves unsaved school settings');
assert.equal(storageEls.sheetSettingsBtn.focused, true);

const saveStorageSource = html.slice(html.indexOf('    function saveSheetUrl() {'), html.indexOf('    function setStorageTestLoading(', html.indexOf('    function saveSheetUrl() {')));
const writes = [];
const saveStorageContext = vm.createContext({
    els:{storageProviderSelect:{value:'supabase'},supabaseUrlInput:{value:'http://invalid'},supabaseKeyInput:{value:'valid-key'}},
    SUPABASE_PROVIDER:'supabase', GOOGLE_SHEET_PROVIDER:'google-sheet',
    normalizeSupabaseUrl:value => value, showToast:() => {}, showStorageTestResult:() => {},
    localStorage:{setItem:(key,value) => writes.push([key,value])}
});
vm.runInContext(saveStorageSource, saveStorageContext);
saveStorageContext.saveSheetUrl();
assert.deepEqual(writes, [], 'Invalid alternative storage does not switch the active provider');
const testStorageSource = html.slice(html.indexOf('    async function testCloudStorageConnection() {'), html.indexOf('    async function supabaseFetch(', html.indexOf('    async function testCloudStorageConnection() {')));
assert.doesNotMatch(testStorageSource, /setStatus\(/, 'Testing an unsaved draft does not change the live connection status');

const closeMenuSource = html.slice(html.indexOf('        function closeMobileActions() {'), html.indexOf('        els.mobileMenuBtn?.addEventListener("click", () => {', html.indexOf('        function closeMobileActions() {')));
const menuOverlay = { classList:classList() };
const menuGroup = { open:true };
const menuSheet = { classList:classList(), inert:false, attributes:{}, querySelectorAll:() => [menuGroup], setAttribute(name, value) { this.attributes[name] = value; } };
const menuTrigger = { attributes:{}, setAttribute(name, value) { this.attributes[name] = value; }, focus() { this.focused = true; } };
const body = { classList:classList() };
menuSheet.classList.add('is-open');
menuOverlay.classList.add('is-open');
body.classList.add('mobile-actions-open');
const menuContext = vm.createContext({ els:{ mobileActionsSheet:menuSheet, mobileActionsOverlay:menuOverlay, mobileMenuBtn:menuTrigger }, document:{ body } });
vm.runInContext(closeMenuSource, menuContext);
menuContext.closeMobileActions();
assert.equal(menuSheet.inert, true);
assert.equal(menuSheet.attributes['aria-hidden'], 'true');
assert.equal(menuTrigger.attributes['aria-expanded'], 'false');
assert.equal(menuTrigger.focused, true);
assert.equal(menuGroup.open, false);
assert.equal(body.classList.contains('mobile-actions-open'), false);
assert.doesNotMatch(saveSource, /querySelectorAll\("input\[data-class-name\]:not\(\[hidden\]\)"\)/);
const rows = [
    { hidden:false, querySelector:() => ({ dataset:{ className:'7A' }, value:'គ្រូ សុខ' }) },
    { hidden:false, querySelector:() => ({ dataset:{ className:'8B' }, value:'គ្រូ ស្រី' }) }
];
const els = {
    teacherSettingsSearch:{ value:'8B' },
    teacherSettingsList:{ querySelectorAll:() => rows },
    teacherSettingsNoResults:{ hidden:true }
};
vm.runInNewContext(`${filterSource}\nfilterTeacherSettings()`, { els });
assert.deepEqual(rows.map(row => row.hidden), [true, false]);
els.teacherSettingsSearch.value = '';
vm.runInNewContext(`${filterSource}\nfilterTeacherSettings()`, { els });
assert.deepEqual(rows.map(row => row.hidden), [false, false]);

const listFilterSource = html.slice(html.indexOf('    function hasActiveFilters() {'), html.indexOf('    async function refreshMissingPhotoCodes(', html.indexOf('    function hasActiveFilters() {')));
const tableClasses = new Set(['compact-view']);
const spanCells = [{ colSpan:9 }, { colSpan:9 }];
const filterControls = {
    searchInput:{ value:'សិស្ស' }, genderFilter:{ value:'ប្រុស' }, classFilter:{ value:'7A' },
    schoolFilter:{ value:'' }, photoFilter:{ value:'' },
    activeFilterCount:{ hidden:true, textContent:'' }, clearFiltersBtn:{ hidden:true },
    toggleFiltersBtn:{ getAttribute:() => 'false', setAttribute:() => {} },
    studentTable:{ classList:{ toggle(name, active) { if (active) tableClasses.add(name); else tableClasses.delete(name); } } },
    toggleTableDetailBtn:{ attributes:{}, setAttribute(name, value) { this.attributes[name] = value; } },
    tableDetailLabel:{ textContent:'' },
    studentList:{ querySelectorAll:() => spanCells }
};
let resets = 0; let refreshes = 0;
const filtersContext = vm.createContext({ els:filterControls, resetPagination:() => { resets++; }, applyFilters:() => { refreshes++; } });
vm.runInContext(`let tableDetailsExpanded = false;\n${listFilterSource}`, filtersContext);
filtersContext.setTableDetailMode(true);
assert.equal(tableClasses.has('compact-view'), false);
assert.equal(filterControls.toggleTableDetailBtn.attributes['aria-pressed'], 'true');
assert.deepEqual(spanCells.map(cell => cell.colSpan), [23, 23]);
filtersContext.setTableDetailMode(false);
assert.equal(tableClasses.has('compact-view'), true);
assert.deepEqual(spanCells.map(cell => cell.colSpan), [9, 9]);
filtersContext.updateFilterUi();
assert.equal(filterControls.activeFilterCount.textContent, '2');
assert.equal(filterControls.clearFiltersBtn.hidden, false);
filtersContext.clearAllListFilters();
assert.deepEqual([filterControls.searchInput.value, filterControls.genderFilter.value, filterControls.classFilter.value], ['', '', '']);
assert.equal(resets, 1);
assert.equal(refreshes, 1);
assert.match(html, /មិនមានសិស្សត្រូវនឹងការស្វែងរក ឬតម្រងនេះ/);
console.log('Navigation and Settings: safe mobile actions, one Settings entry, storage draft preserved, scripts parse');
