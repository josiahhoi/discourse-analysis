const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, load } = require('./helpers/harness');
function setup() { const s = createSandbox(); ['js/utils/constants.js', 'js/services/state.js', 'js/services/profiles.js', 'js/i18n/relationships.js'].forEach(f => load(s, f)); s.DA_I18N.setPreference('zh-CN'); return s; }
test('all five group headings translate without fallback', () => {
  const s = setup();
  for (const [en, zh] of [['COORDINATE RELATIONSHIPS', '并列关系'], ['SUBORDINATE RELATIONSHIPS', '从属关系'], ['Support by Restatement', '以重述支持'], ['Support by Distinct Statement', '以不同陈述支持'], ['Support by Contrary Statement', '以相反陈述支持']]) assert.equal(s.DA_RELATIONSHIPS.getGroupName(en), zh);
});
test('all 92 selector abbreviations are exact profile data including case spaces slash and star', () => {
  const s = setup(); let count = 0;
  for (const id of Object.keys(s.DA_PROFILES.builtins())) {
    s.DA_PROFILES.setActiveById(id); const before = JSON.stringify(s.DA_PROFILES.getActive());
    for (const t of s.DA_PROFILES.getVisibleTypes()) {
      const p = s.DA_RELATIONSHIPS.selectorPresentation(t); count++;
      assert.equal(p.compact, true, id + ':' + t); assert.equal(p.abbr, s.DA_PROFILES.getAbbr(t));
      assert.match(p.name, /[\u3400-\u9fff]/); assert.ok(p.full.endsWith('（' + p.abbr + '）'));
    }
    assert.equal(JSON.stringify(s.DA_PROFILES.getActive()), before);
  }
  assert.equal(count, 92);
});
test('Way-End Means-End Adversative and Double Ground retain separate full learning names', () => {
  const s = setup(); s.DA_PROFILES.setActiveById('gurtner');
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('action-manner').full, '方式关系 Way-End（W / Ed*）');
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('action-purpose').full, '手段—目的 Means-End（M / Ed*）');
  assert.match(s.DA_RELATIONSHIPS.selectorPresentation('concessive').full, /^逆接 Adversative/);
  s.DA_PROFILES.setActiveById('schreiner');
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('double-ground').full, '双侧理由 Double Ground（DG）');
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('bilateral').abbr, 'BL');
});
test('English selector keeps the existing exact full labels for every profile', () => {
  const s = setup(); s.DA_I18N.setPreference('en');
  for (const id of Object.keys(s.DA_PROFILES.builtins())) { s.DA_PROFILES.setActiveById(id); for (const t of s.DA_PROFILES.getVisibleTypes()) { const p = s.DA_RELATIONSHIPS.selectorPresentation(t); assert.equal(p.full, s.DA_PROFILES.getName(t)); assert.equal(p.compact, false); } }
});
test('custom profile names and arbitrary custom notation remain verbatim', () => {
  const s = setup(); const p = JSON.parse(JSON.stringify(s.DA_PROFILES.getActive())); p.builtin = false; p.id = 'my-profile'; p.labels.ground = { name: 'My exact English name', abbr: 'X / Y*' }; s.DA_PROFILES.setActive(p);
  const value = s.DA_RELATIONSHIPS.selectorPresentation('ground'); assert.equal(value.compact, false); assert.equal(value.full, 'My exact English name');
  s.DA_STATE.customLabels = [{ id: 'cl_keep', name: 'User 名称 <literal>', label: 'X/*' }];
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('cl_keep').full, 'User 名称 <literal> (X/*)');
});
test('an imported builtin flag cannot turn a user rename into a translated shorthand', () => {
  const s = setup(); const p = JSON.parse(JSON.stringify(s.DA_PROFILES.getActive())); p.labels.ground.name = 'Personal Ground'; s.DA_PROFILES.setActive(p);
  assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('ground').compact, false); assert.equal(s.DA_RELATIONSHIPS.selectorPresentation('ground').full, 'Personal Ground');
});
test('foreign-type display aliases resolve current notation without mutating stored bracket IDs', () => {
  const s = setup(); s.DA_STATE.brackets = [{ id: 'keep-id', type: 'general-specific', from: 'p0', to: 'p1' }];
  s.DA_PROFILES.setActiveById('josiah'); const before = JSON.stringify(s.DA_STATE.brackets); const view = s.DA_RELATIONSHIPS.selectorPresentation('general-specific');
  assert.match(view.full, /^意思—解释 Idea-Explanation/); assert.equal(view.abbr, s.DA_PROFILES.getAbbr('idea-explanation')); assert.equal(JSON.stringify(s.DA_STATE.brackets), before);
});
test('upstream import status accurately describes Enter rather than double-click in both languages', () => {
  const s = setup();
  for (const locale of ['en', 'zh-CN']) { s.DA_I18N.setPreference(locale); const text = s.DA_I18N.t('s.S0031', { detectedNote: '' }); assert.match(text, /Enter/); assert.doesNotMatch(text, /Double-click|双击/); }
});
