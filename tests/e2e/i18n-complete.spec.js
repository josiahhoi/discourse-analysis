const { test, expect } = require('@playwright/test');
const fixture = { version: 3, passageRef: 'John 1:1-2', propositions: ['Original user words', 'Second user line'], verseRefs: ['1', '2'], brackets: [{ id: 'b-full', type: 'ground', from: 'p0', to: 'p1' }], mainPointSummary: 'Summary 用户正文', parallelLabel: 'CUV', parallelTexts: ['平行经文一', '平行经文二'], comments: [{ id: 'c-full', type: 'bracket', target: { bracketId: 'b-full' }, author: 'User Name', text: 'Original 评论', replies: [] }] };
async function boot(page, { welcome = false, url = '/' } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.addInitScript(welcome => {
    localStorage.setItem('biblebracket_language', 'zh-CN');
    localStorage.setItem('biblebracket_theme', 'light');
    if (!welcome) localStorage.setItem('biblebracket_welcome_seen', 'true');
  }, welcome);
  await page.goto(url); await page.evaluate(() => window.DA_I18N.ready);
  return errors;
}
async function seed(page) { await page.evaluate(f => window.DA_PERSISTENCE.importBracket(f), fixture); }
async function lang(page, value) { await page.evaluate(value => window.DA_I18N.setPreference(value), value); }
async function openPicker(page) { await page.locator('.bracket-hitbox[tabindex="0"]').first().press('Enter'); }

test('Chinese Welcome saves only the verbatim user name and supports immediate English', async ({ page }) => {
  const errors = await boot(page, { welcome: true });
  await expect(page.locator('#welcomeModal')).toContainText('欢迎使用');
  await page.locator('#welcomeName').fill('User <img> 姓名');
  await lang(page, 'en'); await expect(page.locator('#welcomeModal')).toContainText("What's your name?");
  await expect(page.locator('#welcomeName')).toHaveValue('User <img> 姓名');
  await lang(page, 'zh-CN'); await page.locator('#welcomeSaveBtn').click();
  await expect(page.locator('#passageAuthor')).toHaveText('作者：User <img> 姓名');
  expect(await page.evaluate(() => window.DA_EXPORT.buildBracketData().pageAuthor)).toBe('User <img> 姓名');
  expect(errors).toEqual([]);
});
test('main UI, hidden help, tooltips placeholders and accessible names bind both languages', async ({ page }) => {
  const errors = await boot(page);
  for (const [selector, zh, en] of [['#newBracketBtn', '新建', 'New'], ['#saveBtn', '保存', 'Save'], ['#saveAsBtn', '另存为', 'Save As'], ['#exportMenuBtn', '导出…', 'Export As...'], ['#clearBrackets', '清除所有括号', 'Clear All Brackets']]) {
    await expect(page.locator(selector)).toHaveText(zh); await lang(page, 'en'); await expect(page.locator(selector)).toHaveText(en); await lang(page, 'zh-CN');
  }
  await expect(page.locator('#pasteText')).toHaveAttribute('placeholder', /粘贴 Logos/);
  await expect(page.locator('#passageAuthor')).toHaveAttribute('aria-label', '页面作者');
  await expect(page.locator('#redoBtn')).toHaveAttribute('title', /重做/);
  await page.locator('.sidebar-help summary').click(); await expect(page.locator('.sidebar-help-content')).toContainText('在光标处拆分行');
  const missing = await page.evaluate(() => {
    const roots = [document, ...[...document.querySelectorAll('template')].map(t => t.content)];
    return roots.flatMap(root => [...root.querySelectorAll('*')].flatMap(el => [...el.attributes].filter(a => /^data-i18n(?:-(?:title|placeholder|aria-label|data-placeholder|data-drop-label))?$/.test(a.name) && !Object.hasOwn(window.DA_I18N_CATALOGS.en, a.value)).map(a => a.value)));
  });
  expect(missing).toEqual([]); expect(errors).toEqual([]);
});
test('settings translates advanced hints and ARIA without changing raw names or password drafts', async ({ page }) => {
  const errors = await boot(page); await page.locator('#projectSettingsBtn').click();
  await page.locator('.advanced-notation summary').click();
  await expect(page.locator('.notation-hint').last()).toContainText('并非严格的安全保护');
  await expect(page.locator('.notation-name').first()).toHaveAttribute('aria-label', /关系名称/);
  await page.locator('#cloudProfilePassword').fill('Not a real password');
  await page.locator('#exportFilename').fill('User_File_Name');
  const filenamePreview = await page.locator('#exportFilename').getAttribute('placeholder');
  const before = await page.locator('.notation-name').first().inputValue();
  await lang(page, 'en'); await expect(page.locator('.notation-name').first()).toHaveValue(before);
  await expect(page.locator('#exportFilename')).toHaveValue('User_File_Name');
  await expect(page.locator('#exportFilename')).toHaveAttribute('placeholder', filenamePreview);
  await expect(page.locator('#cloudProfilePassword')).toHaveValue('Not a real password'); expect(errors).toEqual([]);
});
test('save-discard and add-replace dialogs translate and cancel without changing data', async ({ page }) => {
  const errors = await boot(page); await seed(page);
  await page.locator('#newBracketBtn').click(); await expect(page.locator('.new-bracket-dialog')).toContainText('保存');
  await lang(page, 'en'); await expect(page.locator('.new-bracket-dialog')).toContainText('Save current bracket');
  await page.locator('.new-bracket-dialog [data-action="cancel"]').click();
  await page.evaluate(() => window.DA_UI.showReplaceAddDialog({ onAdd() {}, onReplace() {} }));
  await lang(page, 'zh-CN'); await expect(page.locator('.new-bracket-dialog [data-action="add"]')).toHaveText('追加');
  await expect(page.locator('.new-bracket-dialog [data-action="replace"]')).toHaveText('替换');
  await page.locator('.new-bracket-dialog [data-action="cancel"]').click();
  expect(await page.evaluate(() => window.DA_STATE.propositions)).toEqual(fixture.propositions); expect(errors).toEqual([]);
});
test('draft recovery banner preserves the title and updates complete bilingual sentences', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('biblebracket_draft', JSON.stringify({ passageRef: 'Original draft <test>', propositions: ['User draft'], verseRefs: ['1'] })));
  const errors = await boot(page); await expect(page.locator('.draft-recovery-banner')).toContainText('是否恢复');
  await lang(page, 'en'); await expect(page.locator('.draft-recovery-banner')).toContainText('Original draft <test> was found');
  await lang(page, 'zh-CN'); await page.locator('[data-action="restore"]').click(); await expect(page.locator('.proposition-text')).toHaveText('User draft'); expect(errors).toEqual([]);
});
test('cloud reconnect and inline join UI translate without issuing cloud writes', async ({ page }) => {
  const errors = await boot(page, { url: '/?project=ABC123' });
  await expect(page.locator('.draft-recovery-banner')).toContainText('ABC123，是否重新连接');
  await expect(page.locator('.draft-recovery-banner')).toHaveAttribute('aria-label', '重新连接云端项目');
  await page.locator('[data-action="dismiss"]').click();
  await page.locator('#openMenuBtn').click(); await page.getByRole('button', { name: '🔗 加入云端协作' }).click();
  await page.locator('#openPicker input').fill('ABC123'); await lang(page, 'en');
  await expect(page.locator('#openPicker input')).toHaveValue('ABC123'); await expect(page.locator('#openPicker input')).toHaveAttribute('placeholder', 'Project ID');
  await lang(page, 'zh-CN'); await expect(page.locator('#openPicker button button')).toHaveText('加入'); expect(errors).toEqual([]);
});
test('Cloud Sync badges and errors update in place with translated approved commands', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.DA_STATE.cloudDirty = false; window.DA_STATE.cloudUnsubscribe = () => {}; window.DA_STATE.activeProjectId = 'ABC123'; window.DA_UI.updateCloudUI(true, 'ABC123'); });
  await expect(page.locator('#manualSyncBtn')).toHaveText('已同步 ✓'); await lang(page, 'en'); await expect(page.locator('#manualSyncBtn')).toHaveText('Synced ✓');
  await lang(page, 'zh-CN'); await page.evaluate(() => { window.DA_STATE.cloudUnsubscribe = null; window.DA_STATE.activeProjectId = null; return window.DA_CLOUD.joinCloudSync('NOTREAL'); });
  await expect(page.locator('.status')).toContainText('Firebase 尚未初始化');
  await page.locator('#exportMenuBtn').click(); await expect(page.locator('#exportMenu')).toContainText('开启云同步'); expect(errors).toEqual([]);
});
for (const profile of ['josiah', 'biblearc', 'gurtner', 'beale', 'schreiner']) {
  test('complete guide and bilingual keywords/search follow ' + profile, async ({ page }) => {
    const errors = await boot(page); await seed(page);
    await page.evaluate(profile => { window.DA_PROFILES.setActiveById(profile); window.DA_UI.openReferenceGuide(); }, profile);
    await expect(page.locator('#referenceGuideTitle')).toContainText(profile === 'biblearc' ? 'BibleArc' : profile[0].toUpperCase() + profile.slice(1));
    await expect(page.locator('#referenceTableBody')).toContainText('因为、由于、既然');
    if (profile === 'gurtner') await expect(page.locator('#referenceTableBody')).toContainText('方式关系 Way-End');
    if (profile === 'gurtner' || profile === 'beale') await expect(page.locator('#referenceTableBody')).toContainText('手段—目的 Means-End');
    if (profile === 'schreiner') await expect(page.locator('#referenceTableBody')).toContainText('中央命题受到前后两侧理由的支持');
    await page.locator('#closeReferenceBtn').click(); await openPicker(page);
    for (const query of ['理由', 'Ground', '由于']) {
      await page.locator('.picker-search').fill(query); await expect(page.locator('#labelPicker button.ground')).toBeVisible();
    }
    await page.locator('.picker-search').fill('Ac/Pur'); await expect(page.locator('#labelPicker button.action-purpose')).toBeVisible();
    expect(await page.evaluate(() => window.DA_STATE.brackets[0].type)).toBe('ground'); expect(errors).toEqual([]);
  });
}
test('context menus and palette tooltips remain live without changing graph symbols', async ({ page }) => {
  const errors = await boot(page); await seed(page);
  const symbols = await page.locator('.bracket-label').allTextContents();
  await page.evaluate(() => window.DA_UI.showBracketActions(0, 100, 100));
  await expect(page.locator('#bracketActions')).toContainText('高亮整行');
  await expect(page.locator('#bracketActions .color-swatch').first()).toHaveAttribute('title', '黄色');
  await lang(page, 'en'); await expect(page.locator('#bracketActions')).toContainText('Highlight Rows');
  await expect(page.locator('#bracketActions .color-swatch').first()).toHaveAttribute('title', 'Yellow');
  expect(await page.locator('.bracket-label').allTextContents()).toEqual(symbols); expect(errors).toEqual([]);
});
test('comment headings and summary labels update without losing comment/reply drafts', async ({ page }) => {
  const errors = await boot(page); await seed(page);
  await page.evaluate(() => window.DA_UI.showCommentPopover({ bracketIdx: 0, existingCommentId: 'c-full' }));
  await expect(page.locator('.popover-title')).toContainText('理由 Ground');
  await page.locator('.reply-input').last().fill('Unsent reply 草稿');
  await lang(page, 'en'); await expect(page.locator('.popover-title')).toContainText('Ground');
  await expect(page.locator('.reply-input').last()).toHaveValue('Unsent reply 草稿');
  await lang(page, 'zh-CN'); await expect(page.locator('.comment-text').first()).toContainText('Original 评论');
  expect(await page.evaluate(() => window.DA_UI.summaryCommentLabel(0, 7))).toBe('经文主旨摘要：“Summary”'); expect(errors).toEqual([]);
});
test('Block Diagram and Parallel Column dialogs update display only', async ({ page }) => {
  const errors = await boot(page); await seed(page);
  await page.evaluate(() => window.DA_BLOCK.setActive(true)); await expect(page.locator('.bd-label')).toContainText('理由');
  await lang(page, 'en'); await expect(page.locator('.bd-label')).toContainText('ground to verse');
  await page.evaluate(() => window.DA_UI.showParallelDialog()); await lang(page, 'zh-CN');
  await expect(page.locator('#parallelTranslationSelect option[value="WLC"]')).toHaveText(/希伯来文/);
  expect(await page.evaluate(() => window.DA_STATE.parallelTexts)).toEqual(fixture.parallelTexts); expect(errors).toEqual([]);
});
test('CSS drop target and global error boundary translate safely with technical details intact', async ({ page }) => {
  const errors = await boot(page);
  expect(await page.locator('.bracket-canvas-wrapper').getAttribute('data-drop-label')).toBe('拖到此处导入');
  await lang(page, 'en'); expect(await page.locator('.bracket-canvas-wrapper').getAttribute('data-drop-label')).toBe('Drop to import');
  await lang(page, 'zh-CN'); await page.evaluate(() => window.onerror('HTTP 503 <img>', '', 0, 0, null));
  await expect(page.locator('.status')).toHaveText('⚠ 出错了：HTTP 503 <img>'); await expect(page.locator('.status img')).toHaveCount(0); expect(errors).toEqual([]);
});
