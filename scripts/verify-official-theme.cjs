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
const pages = ['index.html', 'teacher-portal.html', ...(releaseTemplate ? [releaseTemplate] : [])];

for (const file of pages) {
  const html = read(file);
  const style = html.match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/i)?.[1];
  assert.ok(style, `${file}: inline CSS exists`);
  const ast = postcss.parse(style, { from: file });
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  assert.equal((markup.match(/<body\b/gi) || []).length, 1, `${file}: one body`);
  assert.equal((markup.match(/<main\b/gi) || []).length, 1, `${file}: one main`);

  // Official theme: flat navy/white surfaces, gold rule, Moul titles and Battambang body text.
  assert.match(style, /OFFICIAL SCHOOL THEME/, `${file}: official theme layer exists`);
  assert.match(style, /--font-title:\s*['"]Moul['"]/, `${file}: Moul is the title face`);
  assert.match(style, /--font-body:\s*['"]Battambang['"]/, `${file}: Battambang is the body face`);
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Battambang:wght@400;700&family=Moul/, `${file}: theme fonts are loaded`);
  assert.match(style, /#0f2e5a/i, `${file}: navy header colour`);
  assert.match(style, /#b8902f/i, `${file}: gold accent colour`);

  // The previous animated/decorative layers are gone.
  assert.doesNotMatch(markup, /class="(?:ambient-grid|portal-ambient)"/, `${file}: no decorative ambient layer`);
  const keyframes = [];
  ast.walkAtRules('keyframes', rule => keyframes.push(rule.params));
  assert.deepEqual(keyframes.filter(name => /ambient/.test(name)), [], `${file}: no ambient animations`);
  assert.match(style, /@media\s*\(?prefers-reduced-motion:\s*reduce\)?/, `${file}: reduced-motion is respected`);
}

const appStyle = read('index.html').match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/i)[1];
const appTheme = appStyle.slice(appStyle.indexOf('OFFICIAL SCHOOL THEME'));
for (const selector of ['.metric', '.class-tile', '.report-export-grid', '.report-section-heading', '.settings-storage-link', '.modal-dialog', '.mobile-tabs', '.mobile-tab-btn svg']) {
  assert.ok(appTheme.includes(selector), `App theme covers ${selector}`);
}
assert.doesNotMatch(appTheme, /translateY\(-/, 'Official theme does not lift surfaces on hover');
const portalStyle = read('teacher-portal.html').match(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/i)[1];
const portalTheme = portalStyle.slice(portalStyle.indexOf('OFFICIAL SCHOOL THEME'));
for (const selector of ['.login-hero', '.portal-hero', '.student-card', '.tabs']) {
  assert.ok(portalTheme.includes(selector), `Teacher portal theme covers ${selector}`);
}

if (releaseTemplate) {
  assert.equal(read('teacher-portal.html'), read(releaseTemplate),
    `Local portal preview and Apps Script release template (${releaseTemplate}) must be identical`);
}
for (const file of ['index.html', 'teacher-portal.html']) {
  const output = path.join(root, 'dist', file);
  if (fs.existsSync(output)) assert.equal(read(file), fs.readFileSync(output, 'utf8'), `${file}: built preview is current`);
}
console.log(`Official theme: CSS parsed, fonts and colours set, decoration removed, ${releaseTemplate ? 'Apps Script/preview synced' : 'no local Apps Script release folder to compare'}`);
