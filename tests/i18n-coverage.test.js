const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const audit = require('../scripts/audit-i18n.cjs');
const { createNativeMenuTranslator } = require('../js/i18n/native-menu.cjs');
const { createSandbox, load } = require('./helpers/harness');
function setup() {
  const s = createSandbox();
  ['js/utils/constants.js', 'js/services/state.js', 'js/services/profiles.js', 'js/i18n/relationships.js'].forEach(f => load(s, f));
  return s;
}
const dict = audit.catalogs();
test('full coverage guard: all explicit keys, catalog parity and source fingerprints pass', () => {
  assert.deepEqual(audit.check().issues, []);
});
test('every production message now has Chinese in every production message', () => {
  assert.deepEqual(Object.keys(dict.en).filter(k => !Object.hasOwn(dict['zh-CN'], k)).sort(), [...audit.intentionalFallback].sort());
});
test('Chinese never introduces a key without a complete English baseline', () => {
  for (const k of Object.keys(dict['zh-CN'])) assert.ok(dict.en[k], k);
});
test('catalog messages never contain missing markers, undefined or executable markup', () => {
  for (const lang of Object.values(dict)) for (const [k, value] of Object.entries(lang))
    for (const text of typeof value === 'string' ? [value] : Object.values(value))
      assert.doesNotMatch(text, /undefined|\[missing translation\]|<\/?(?:script|img|iframe)\b/i, k);
});
test('Chinese interpolation only consumes parameters defined by the English template', () => {
  const parameters = value => new Set([...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map(m => m[1]));
  for (const [k, text] of Object.entries(dict['zh-CN']))
    for (const p of parameters(text)) assert.ok(parameters(dict.en[k]).has(p), k + ':' + p);
});
test('new source English is reported for review, including extra occurrences of existing text', () => {
  const before = audit.literals('example.js', "button.title = 'Save';");
  const after = audit.literals('example.js', "button.title = 'Publish now';");
  assert.equal(audit.compareSnapshot(after, before).length, 1);
  assert.equal(audit.compareSnapshot([{ ...before[0], occurrences: 2 }], [{ ...before[0], occurrences: 1 }]).length, 1);
});
test('source scan includes CSS, native Electron, API proxy and all renderer modules', () => {
  const files = new Set(audit.collect().map(x => x.file));
  for (const file of ['styles.css', 'main.js', 'preload.js', 'functions/index.js', 'js/i18n/native-menu.cjs', 'js/utils/render-brackets.js'])
    assert.ok(files.has(file) || file === 'styles.css' && !/content\s*:\s*['"][A-Za-z]/.test(fs.readFileSync(file, 'utf8')), file);
});
test('locale switching leaves canonical constants, builtin profiles and aliases unchanged', () => {
  const s = setup();
  const before = JSON.stringify([s.DA_CONSTANTS, s.DA_PROFILES.builtins()]);
  for (const locale of ['zh-CN', 'zh-Hant', 'en']) {
    s.DA_I18N.setPreference(locale);
    for (const id of Object.keys(s.DA_PROFILES.builtins())) {
      s.DA_PROFILES.setActiveById(id);
      for (const type of s.DA_PROFILES.getVisibleTypes()) s.DA_RELATIONSHIPS.selectorPresentation(type);
    }
    assert.equal(JSON.stringify([s.DA_CONSTANTS, s.DA_PROFILES.builtins()]), before);
  }
});
test('all 92 rows have Chinese help and readable keywords where upstream defines them', () => {
  const s = setup(); s.DA_I18N.setPreference('zh-CN'); let count = 0;
  for (const id of Object.keys(s.DA_PROFILES.builtins())) {
    s.DA_PROFILES.setActiveById(id);
    for (const t of s.DA_PROFILES.getVisibleTypes()) {
      count++;
      assert.match(s.DA_RELATIONSHIPS.getDefinition(t), /[\u3400-\u9fff]/, id + ':' + t);
      const raw = s.DA_CONSTANTS.RELATIONSHIP_DEFINITIONS[t]?.keywords;
      if (raw && raw !== '?') assert.match(s.DA_RELATIONSHIPS.getKeywords(t), /[\u3400-\u9fff]/, id + ':' + t);
    }
  }
  assert.equal(count, 92);
});
test('new Chinese keywords and cross-profile English terms enter the same search index', () => {
  const s = setup();
  for (const [type, query] of [['ground', '由于'], ['inference', '因而'], ['action-purpose', '免得'], ['action-manner', 'Way-End']]) {
    const idx = s.DA_PROFILES.searchIndexFor(type);
    assert.ok(s.DA_PROFILES.matchesSearch(idx.nameBlob + idx.keywordBlob, query), query);
  }
});
test('all known undo actions translate only at display time', () => {
  const actions = new Set();
  for (const r of audit.collect()) if (r.file.endsWith('.js'))
    for (const m of fs.readFileSync(r.file, 'utf8').matchAll(/pushUndo\('([^']+)'/g)) actions.add(m[1]);
  for (const a of actions) assert.match(dict['zh-CN']['action.' + a] || '', /[\u3400-\u9fff]/, a);
});
test('notation writable names use raw profile values rather than bilingual display names', () => {
  const source = fs.readFileSync('js/services/notation-ui.js', 'utf8');
  assert.match(source, /name\.value = stripAbbr\(DA_PROFILES\.getName\(type\)\)/);
  assert.doesNotMatch(source, /name\.value\s*=\s*(?:DA_I18N|DA_RELATIONSHIPS)/);
});
test('CSS drop hint reads a marked translated attribute rather than fixed English', () => {
  assert.match(fs.readFileSync('styles.css', 'utf8'), /content: attr\(data-drop-label\)/);
  assert.match(fs.readFileSync('index.html', 'utf8'), /data-i18n-data-drop-label="drop.import"/);
});
function fakeMenu() {
  const click = () => 7;
  const original = { items: [{ role: 'filemenu', label: 'File', type: 'submenu', submenu: { items: [{ role: 'close', label: 'Close Window', type: 'normal', accelerator: 'Cmd+W' }, { role: null, label: 'Third-party item', type: 'normal', click }] } }] };
  let result, calls = 0;
  const menu = { getApplicationMenu: () => original, buildFromTemplate: x => x, setApplicationMenu: x => { result = x; calls++; } };
  return { update: createNativeMenuTranslator(menu, 'Discourse Analysis'), result: () => result, calls: () => calls, click };
}
test('native menu Chinese keeps original roles, accelerators and unknown item actions', () => {
  const f = fakeMenu(); assert.equal(f.update('zh-CN'), true);
  const menu = f.result(); assert.equal(menu[0].label, '文件');
  assert.equal(menu[0].submenu[0].label, '关闭窗口'); assert.equal(menu[0].submenu[0].accelerator, 'Cmd+W');
  assert.equal(menu[0].submenu[1].label, 'Third-party item'); assert.equal(menu[0].submenu[1].click, f.click);
});
test('native menu English restores exact original labels and rejects unsupported locales', () => {
  const f = fakeMenu(); f.update('zh-CN'); f.update('en');
  assert.equal(f.result()[0].label, 'File'); assert.equal(f.update('invalid'), false); assert.equal(f.calls(), 2);
});
test('dynamic errors use Chinese wrappers and retain original technical detail as plain text', () => {
  const s = setup();s.DA_I18N.setPreference('zh-CN');
  assert.equal(s.DA_I18N.t('s.S0082', { error: 'HTTP 503 <bad>' }), '无法开启云同步：HTTP 503 <bad>');
});

test('audit rejects missing or extra catalog keys and missing data parameters', () => {
  for (const locale of ['en', 'zh-CN', 'zh-Hant']) {
    const changed = JSON.parse(JSON.stringify(dict));
    delete changed[locale]['project.codeCopied'];
    assert.ok(audit.check({ dict: changed }).issues.length, locale);
  }
  const changed = JSON.parse(JSON.stringify(dict));
  changed['zh-CN']['unknown.key'] = '额外';
  changed['zh-Hant']['project.codeCopied'] = '已複製';
  const issues = audit.check({ dict: changed }).issues;
  assert.ok(issues.some(x => x.includes('No English baseline')));
  assert.ok(issues.some(x => x.includes('Unapproved parameter omission')));
});
test('compact source fingerprints detect new, changed and repeated source text', () => {
  const rows = source => audit.literals('example.js', source).map(r => ({ ...r, occurrences: 1 }));
  const before = rows("button.title = 'Save';");
  assert.deepEqual(audit.fingerprints(rows("\nbutton.title = 'Save';")), audit.fingerprints(before));
  assert.notDeepEqual(audit.fingerprints(rows("button.title = 'Publish';")), audit.fingerprints(before));
  assert.notDeepEqual(audit.fingerprints([{ ...before[0], occurrences: 2 }]), audit.fingerprints(before));
  const issues = audit.check({ baseline: {} }).issues;
  assert.ok(issues.some(x => x.includes('Review changed source literals: main.js')));
});
