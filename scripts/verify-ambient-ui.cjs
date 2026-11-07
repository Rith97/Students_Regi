const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
// Apps Script release folders (script-release-<version>/TeacherPortal.html) are
// local copies made for pasting into Apps Script and are not committed. Check
// the newest one only when it exists on this machine.
const releaseTemplate = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && /^script-release-/.test(entry.name))
  .map(entry => path.join(entry.name, 'TeacherPortal.html'))
  .filter(file => fs.existsSync(path.join(root, file)))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  .pop();
const pages = [
  ['index.html', 'ambient-grid'],
  ['teacher-portal.html', 'portal-ambient'],
  ...(releaseTemplate ? [[releaseTemplate, 'portal-ambient']] : [])
];

for (const [file, layer] of pages) {
  const html = read(file);
  const style = html.match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/i)?.[1];
  assert.ok(style, `${file}: inline CSS exists`);
  postcss.parse(style, { from: file });
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  assert.equal((markup.match(/<body\b/gi) || []).length, 1, `${file}: one body`);
  assert.equal((markup.match(/<main\b/gi) || []).length, 1, `${file}: one main`);
  assert.match(markup, new RegExp(`<div class="${layer}" aria-hidden="true"><\\/div>`), `${file}: decorative layer is hidden from assistive technology`);
  assert.match(style, /@keyframes ambient-grid-drift/);
  assert.match(style, /@keyframes ambient-orb-one/);
  assert.match(style, /@keyframes ambient-orb-two/);
  assert.match(style, /@media\s*\(?prefers-reduced-motion:\s*reduce\)?[\s\S]*?ambient-(?:grid|orb)/,
    `${file}: reduced-motion stops ambient animation`);
  assert.match(style, /@media\s*print[\s\S]*?ambient/, `${file}: print hides decoration`);
  assert.match(style, /@media\s+screen\s*\{[\s\S]*?linear-gradient/, `${file}: screen-only depth surfaces exist`);
  assert.match(style, /box-shadow:[^;}]+inset/, `${file}: raised and inset surface depth exists`);
}

const appStyle = read('index.html').match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/i)[1];
for (const selector of ['.metric', '.class-tile', '.report-export-section', '.settings-storage-link', '.modal-dialog', '.mobile-tabs']) {
  assert.ok(appStyle.includes(selector), `App covers ${selector}`);
}
const portalStyle = read('teacher-portal.html').match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/i)[1];
for (const selector of ['.login-hero', '.portal-hero', '.student-card', '.tabs']) {
  assert.ok(portalStyle.includes(selector), `Teacher portal covers ${selector}`);
}

if (releaseTemplate) {
  assert.equal(read('teacher-portal.html'), read(releaseTemplate),
    `Local portal preview and Apps Script release template (${releaseTemplate}) must be identical`);
}
for (const file of ['index.html', 'teacher-portal.html']) {
  const output = path.join(root, 'dist', file);
  if (fs.existsSync(output)) assert.equal(read(file), fs.readFileSync(output, 'utf8'), `${file}: built preview is current`);
}
console.log(`Ambient UI: CSS parsed, markup checked, reduced motion and print covered, ${releaseTemplate ? 'Apps Script/preview synced' : 'no local Apps Script release folder to compare'}`);
