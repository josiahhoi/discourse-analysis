const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createSandbox, load } = require('./helpers/harness');
for (const [locale, expected] of [
  ['en', 'Replace the current ESV column (including any edits) with NASB? Ctrl+Z undoes this.'],
  ['zh-CN', '确定用 NASB 替换当前 ESV 栏（包括所有编辑内容）？可按 Ctrl+Z 撤销。']
]) test('parallel replacement confirmation direction: ' + locale, () => {
  const s = createSandbox(); load(s, 'js/utils/constants.js');
  s.DA_I18N.setPreference(locale);
  assert.equal(s.DA_I18N.t('s.S0622', { newTranslation: 'ESV', oldTranslation: 'NASB' }), expected);
  assert.match(fs.readFileSync('js/utils/ui-menus.js', 'utf8'), /newTranslation: DA_STATE.parallelLabel, oldTranslation: code/);
});
