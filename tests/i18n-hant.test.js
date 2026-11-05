const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createSandbox, load } = require('./helpers/harness');
const { createNativeMenuTranslator } = require('../js/i18n/native-menu.cjs');
function setup(locale = 'zh-Hant', saved) {
  const s = createSandbox();
  if (saved) s.localStorage.setItem('biblebracket_language', saved);
  ['js/utils/constants.js', 'js/services/state.js', 'js/services/profiles.js', 'js/i18n/relationships.js'].forEach(f => load(s, f));
  s.DA_I18N.setPreference(locale); return s;
}
const { terms, matrix } = require('./fixtures/i18n-relationships.json');
// Independent human-approved expectations, not generated from production overrides.
const schreiner = {
  series: '連續性', progression: '漸進性', alternative: '選擇性',
  'action-manner': '行動與方式', comparison: '比較', 'negative-positive': '否定與肯定',
  'idea-explanation': '概念與解釋', 'question-answer': '問與答', ground: '理據', inference: '推論',
  'action-result': '行動與結果', 'action-purpose': '行動與目的', conditional: '條件性',
  temporal: '時間性', locative: '地點性', bilateral: '雙邊的', 'double-ground': '雙重理據',
  concessive: '讓步性', 'situation-response': '處境與回應'
};
const locales = [
  ['zh-Hant', 'zh-Hant'], ['zh-Hant-TW', 'zh-Hant'], ['zh-Hant-HK', 'zh-Hant'], ['zh-Hant-CN', 'zh-Hant'],
  ['zh-Hans', 'zh-CN'], ['zh-Hans-CN', 'zh-CN'], ['zh-Hans-SG', 'zh-CN'], ['zh-Hans-TW', 'zh-CN'],
  ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'],
  ['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-MY', 'zh-CN'], ['zh', 'zh-CN'],
  ['ZH_hant_hk', 'zh-Hant'], ['ZH_hans_tw', 'zh-CN'], ['zh-Hant-US', 'zh-Hant'],
  ['zh-US', 'en'], ['zh-Latn-TW', 'en'], ['zh-CN-u-co-hant', 'zh-CN'],
  ['not_a_locale!', 'en'], ['', 'en'], [null, 'en'], ['en-US', 'en'], ['ja-JP', 'en'], ['fr-FR', 'en']
];
for (const [locale, expected] of locales) test('Hant resolver: ' + locale, () => {
  const s = setup(); assert.equal(s.DA_I18N.resolveLocale([locale]), expected);
});
test('unsupported first language is not overridden by secondary Hant', () => {
  assert.equal(setup().DA_I18N.resolveLocale(['fr-FR', 'zh-Hant']), 'en');
});
test('Hant preference survives a fresh instance, stays local, and accepts only stable codes', () => {
  const s = setup(); const next = setup('zh-Hant', s.localStorage.getItem('biblebracket_language'));
  assert.equal(next.DA_I18N.getPreference(), 'zh-Hant'); assert.equal(next.DA_I18N.setPreference('zh-TW'), false);
  assert.equal(s.localStorage.getItem('biblebracket_language'), 'zh-Hant');
});
test('missing, empty, or malformed Hant values fall straight to English, never Simplified', () => {
  const s = setup();
  s.DA_I18N_CATALOGS['zh-Hant'] = { 'common.save': '', 'common.done': 3, 'relationship.removed': {} };
  assert.equal(s.DA_I18N.t('common.save'), 'Save'); assert.equal(s.DA_I18N.t('common.done'), 'Done');
  assert.equal(s.DA_I18N.t('relationship.removed', { count: 2 }), '2 brackets removed.');
  assert.equal(s.DA_I18N.t('settings.open'), 'Settings');
});
test('all three catalogs have exactly the same 601 nonempty safe values', () => {
  const s = setup(), d = s.DA_I18N_CATALOGS;
  for (const locale of ['en', 'zh-CN', 'zh-Hant']) {
    assert.equal(Object.keys(d[locale]).length, 601);
    assert.deepEqual(Object.keys(d[locale]).sort(), Object.keys(d.en).sort());
    s.DA_I18N.setPreference(locale);
    for (const key of Object.keys(d.en)) {
      const value = s.DA_I18N.t(key, { count: 2 });
      assert.ok(value); assert.doesNotMatch(value, /undefined|\[missing translation\]|<script/i, locale + ':' + key);
    }
  }
});
test('Hant interpolation enforces the seven approved grammar exceptions without losing data parameters', () => {
  const d = setup().DA_I18N_CATALOGS;
  const parameters = value => [...new Set([...JSON.stringify(value).matchAll(/\{(\w+)\}/g)].map(x => x[1]))].sort();
  // Seven existing Chinese omissions are English grammatical unit words, not user data.
  const grammarOnly = { 's.S0017': ['verses'], 's.S0026': ['verses'], 's.S0029': ['verses'],
    's.S0422': ['rows'], 's.S0425': ['rows'], 'confirm.deleteDependents': ['brackets'], 'block.verses': ['unit'] };
  for (const key of Object.keys(d.en)) {
    assert.deepEqual(parameters(d['zh-Hant'][key]), parameters(d['zh-CN'][key]), key);
    assert.deepEqual(parameters(d.en[key]).filter(x => !parameters(d['zh-Hant'][key]).includes(x)), grammarOnly[key] || [], key);
    for (const p of parameters(d['zh-Hant'][key])) assert.ok(parameters(d.en[key]).includes(p), key);
  }
});
for (const term of terms) test('approved generic Hant term ' + term.key, () => {
  const s = setup(); assert.equal(s.DA_I18N.t(term.key), term.suggestedZhHant + ' ' + term.english);
});
for (const [type, name] of Object.entries(schreiner)) test('Schreiner Hant main display: ' + type, () => {
  const s = setup(); s.DA_PROFILES.setActiveById('schreiner'); const view = s.DA_RELATIONSHIPS.selectorPresentation(type);
  assert.equal(view.name, name); assert.equal(view.abbr, s.DA_PROFILES.getAbbr(type));
  assert.equal(view.full, name + ' ' + s.DA_I18N_CATALOGS.en['relationship.name.' + type] + '（' + view.abbr + '）');
});
for (const id of ['josiah', 'biblearc', 'gurtner', 'beale', 'schreiner']) test('Hant frozen matrix for ' + id, () => {
  const s = setup(); s.DA_PROFILES.setActiveById(id); const before = JSON.stringify(s.DA_PROFILES.getActive());
  const rows = matrix.filter(r => r.profileId === id);
  assert.deepEqual(Array.from(s.DA_PROFILES.getVisibleTypes()), rows.map(r => r.relationshipId));
  for (const r of rows) {
    const t = r.relationshipId, view = s.DA_RELATIONSHIPS.selectorPresentation(t);
    assert.equal(s.DA_PROFILES.getName(t), r.rawEnglishName); assert.equal(view.abbr, r.originalAbbreviation);
    assert.equal(s.DA_PROFILES.getColor(t), r.originalColor);
    assert.equal(view.full, (id === 'schreiner' ? schreiner[t] : r.suggestedZhHantName) + ' ' + r.englishName + '（' + r.originalAbbreviation + '）');
    assert.match(s.DA_RELATIONSHIPS.getDefinition(t), /[\u3400-\u9fff]/);
  }
  assert.equal(JSON.stringify(s.DA_PROFILES.getActive()), before);
});
test('Schreiner overrides never leak across profiles or languages; groups also follow active profile', () => {
  const s = setup();
  s.DA_PROFILES.setActiveById('schreiner');
  assert.equal(s.DA_RELATIONSHIPS.getGroupName('Support by Restatement'), '以再陳述輔助');
  assert.equal(s.DA_RELATIONSHIPS.getGroupName('Support by Distinct Statement'), '以額外陳述輔助');
  assert.equal(s.DA_RELATIONSHIPS.getGroupName('Support by Contrary Statement'), '以對立陳述輔助');
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('ground').name, '理據');
  s.DA_PROFILES.setActiveById('biblearc');
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('ground').name, '理由');
  assert.equal(s.DA_RELATIONSHIPS.getGroupName('Support by Restatement'), '以重述支持');
  s.DA_PROFILES.setActiveById('schreiner'); s.DA_I18N.setPreference('zh-CN');
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('double-ground').name, '双侧理由');
  s.DA_I18N.setPreference('en');
  assert.equal(s.DA_RELATIONSHIPS.getName('ground'), s.DA_PROFILES.getName('ground'));
});
for (const locale of ['en', 'zh-CN', 'zh-Hant']) test('search in ' + locale + ' accepts both scripts, publication and generic names, English and raw notation', () => {
  const s = setup(locale); s.DA_PROFILES.setActiveById('schreiner');
  const cases = [['ground', ['理據', '理由', 'Ground', 'G']], ['series', ['連續性', '並列列舉', '并列列举']],
    ['inference', ['推论', '推論', 'Inference']], ['action-purpose', ['行动', '行動', 'Ac / Pur']],
    ['double-ground', ['雙重理據', '雙側理由', '双侧理由', 'DG']], ['bilateral', ['雙邊的', '雙向支持', 'BL']]];
  for (const [t, queries] of cases) { const index = s.DA_PROFILES.searchIndexFor(t);
    for (const q of queries) assert.ok(s.DA_PROFILES.matchesSearch(index.nameBlob + index.keywordBlob, q), locale + ':' + q);
  }
  s.DA_PROFILES.setActiveById('gurtner');
  const index = s.DA_PROFILES.searchIndexFor('action-manner');
  for (const q of ['W / Ed', 'Way-End', '方式關係', '方式关系']) assert.ok(s.DA_PROFILES.matchesSearch(index.nameBlob + index.keywordBlob, q), q);
});
test('Hant never translates user profiles, renamed builtins, or custom relationship names', () => {
  const s = setup(); s.DA_PROFILES.setActiveById('schreiner');
  const p = JSON.parse(JSON.stringify(s.DA_PROFILES.getActive())); p.labels.ground.name = '用户简体 Ground';
  s.DA_PROFILES.setActive(p); assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('ground').full, '用户简体 Ground');
  p.builtin = false; p.id = 'my-own'; p.name = '我的简体方案'; s.DA_PROFILES.setActive(p);
  assert.equal(s.DA_RELATIONSHIPS.getGroupName('Support by Restatement'), '以重述支持');
  s.DA_STATE.customLabels = [{ id: 'cl_keep', name: '用户简体 <literal>', label: '原/*' }];
  assert.equal(s.DA_RELATIONSHIPS.getName('cl_keep'), '用户简体 <literal> (原/*)');
});
test('Hant interpolation is plain text and uses approved direction for actual parallel arguments', () => {
  const s = setup(); assert.equal(s.DA_I18N.t('s.S0622', { newTranslation: 'ESV', oldTranslation: 'NASB' }),
    '確定以 NASB 取代目前的 ESV 欄（包含所有編輯內容）？可按 Ctrl+Z 復原。');
  assert.equal(s.DA_I18N.t('project.codeCopied', { code: '<img onerror=bad()>' }), '已複製專案代碼 <img onerror=bad()>。');
});
test('Hant native menu preserves roles, shortcuts, click action and exact English restoration', () => {
  const click = () => 3; let result;
  const menu = { getApplicationMenu: () => ({ items: [{ role: 'editmenu', label: 'Edit', submenu: { items: [
    { role: 'undo', label: 'Undo', accelerator: 'CommandOrControl+Z' }, { role: null, label: 'Custom', click }
  ] } }] }), buildFromTemplate: t => t, setApplicationMenu: t => { result = t; } };
  const update = createNativeMenuTranslator(menu, 'Discourse Analysis'); update('zh-Hant');
  assert.equal(result[0].label, '編輯'); assert.equal(result[0].submenu[0].label, '復原');
  assert.equal(result[0].submenu[0].accelerator, 'CommandOrControl+Z'); assert.equal(result[0].submenu[1].click, click);
  update('en'); assert.equal(result[0].label, 'Edit'); assert.equal(result[0].submenu[0].label, 'Undo');
});
test('Hant date display uses a valid Intl locale without altering timestamps', () => {
  const timestamp = '2026-11-04T12:00:00.000Z', s = setup();
  assert.ok(new Date(timestamp).toLocaleString(s.DA_I18N.getLocale())); assert.equal(timestamp, '2026-11-04T12:00:00.000Z');
  assert.match(fs.readFileSync('js/utils/ui-comments.js', 'utf8'), /toLocaleString\(DA_I18N.getLocale\(\)\)/);
});
test('Hant renderer source and profile override data are UTF-8 and standalone static resources', () => {
  const s = { window: {} }; vm.createContext(s);
  vm.runInContext(fs.readFileSync('js/i18n/zh-Hant.js', 'utf8'), s);
  assert.equal(s.window.DA_I18N_CATALOGS['zh-Hant']['language.chinese'], '簡體中文');
  assert.equal(s.window.DA_I18N_CATALOGS['zh-Hant']['view.redo'], '重做');
  const css = fs.readFileSync('styles.css', 'utf8'); assert.match(css, /PingFang TC.*Microsoft JhengHei.*system-ui/);
});
