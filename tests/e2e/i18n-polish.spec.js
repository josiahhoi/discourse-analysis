const { test, expect } = require('@playwright/test');
const fixture = { version: 3, passageRef: '视觉检查样例 Layout specimen', propositions: ['This is a long user-authored English line for layout checking, with punctuation and several clauses that must remain readable.', '这是用户编写的中文排版样例，用于检查换行、标点、评论和双语关系显示，不作为圣经经文。', 'A third line for nested relations and text selection.'], verseRefs: ['1', '2', '3'], brackets: [{ id: 'visual-b1', type: 'ground', from: 'p0', to: 'p1' }, { id: 'visual-b2', type: 'action-purpose', from: 'visual-b1', to: 'p2' }], mainPointSummary: 'User summary 用户摘要，不参与翻译。', comments: [{ id: 'visual-c1', type: 'text', target: { propIndex: 0, start: 0, end: 4 }, text: 'User comment 用户评论', author: 'Layout QA', replies: [] }], parallelLabel: 'CUV', parallelTexts: ['第一栏旁的平行经文样例，保留用户原文。', 'Parallel user text beside Chinese.', '第三行平行文字。'], parallelHidden: false };
const layouts = [[800, 572, 150], [1400, 872, 100]];
const profiles = ['josiah', 'biblearc', 'gurtner', 'beale', 'schreiner'];
async function boot(page, language = 'zh-CN') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.addInitScript(language => {
    localStorage.setItem('biblebracket_language', language);
    localStorage.setItem('biblebracket_welcome_seen', 'true');
    localStorage.setItem('biblebracket_theme', 'light');
  }, language);
  await page.goto('/'); await page.evaluate(() => window.DA_I18N.ready);
  return errors;
}
async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
}
async function seed(page, data = fixture) { await page.evaluate(data => window.DA_PERSISTENCE.importBracket(data), data); await settle(page); }
async function theme(page, value) { await page.evaluate(value => { if (document.documentElement.getAttribute('data-theme') !== value) window.DA_UI.toggleTheme(); }, value); }
async function within(page, selector) {
  const r = await page.locator(selector).evaluate(e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
  expect(r.left).toBeGreaterThanOrEqual(0); expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(r.width + 1); expect(r.bottom).toBeLessThanOrEqual(r.height + 1);
}
async function abbreviationChecks(page) {
  const issues = await page.locator('#labelPicker button.relationship-option').evaluateAll(buttons => buttons.flatMap(b => {
    const span = b.querySelector('.relationship-option-abbr');
    const r = span.getBoundingClientRect(), box = b.getBoundingClientRect();
    const expected = window.DA_PROFILES.getAbbr(b.dataset.relationshipType);
    return span.textContent !== expected || r.left < box.left - 1 || r.right > box.right + 1 || span.scrollWidth > span.clientWidth + 1 || getComputedStyle(span).textOverflow === 'ellipsis' ? [b.dataset.relationshipType] : [];
  }));
  expect(issues).toEqual([]);
}

for (const [width, height, zoom] of layouts) for (const mode of ['light', 'dark']) {
  test(`visual matrix ${width}x${height} zoom ${zoom} ${mode}`, async ({ page }) => {
    const errors = await boot(page); await page.setViewportSize({ width, height }); await seed(page); await theme(page, mode);
    await page.evaluate(zoom => window.DA_UI.setZoomLevel(zoom), zoom); await settle(page);
    expect(await page.evaluate(() => window.DA_STATE.zoomLevel)).toBe(zoom);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
    await within(page, '.workspace-toolbar');
    await page.locator('#projectSettingsBtn').click(); await settle(page);
    await page.locator('.advanced-notation > summary').click(); await settle(page);
    await within(page, '#settingsModal .modal-content'); await within(page, '#saveSettingsBtn');
    expect(await page.locator('#settingsModal .modal-body').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.locator('#closeSettingsBtn').click();
    for (const profile of profiles) {
      await page.evaluate(profile => { window.DA_PROFILES.setActiveById(profile); window.DA_UI.openReferenceGuide(); }, profile); await settle(page);
      await within(page, '#referenceModal .modal-content');
      expect(await page.locator('#referenceModal .modal-body').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      await expect(page.locator('#referenceTableBody')).toContainText('并列关系');
      await expect(page.locator('#referenceTableBody')).toContainText('以重述支持');
      expect(await page.locator('#referenceTableBody td').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
      await page.locator('#closeReferenceBtn').click();
    }
    await page.locator('.bracket-hitbox[tabindex="0"]').first().press('Enter'); await settle(page);
    await within(page, '#labelPicker'); await abbreviationChecks(page);
    await page.locator('#labelPicker button.ground').focus();
    await expect(page.locator('.info-name')).toContainText('理由 Ground（G）');
    await expect(page.locator('#labelPicker button.ground')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.DA_BLOCK.setActive(true)); await settle(page);
    expect(await page.locator('.bd-label').first().evaluate(e => getComputedStyle(e).whiteSpace)).toBe('normal');
    await page.evaluate(() => window.DA_BLOCK.setActive(false));
    expect(errors).toEqual([]);
  });
}
test('selector compresses Chinese before raw profile notation and retains full details and IME', async ({ page }) => {
  const errors = await boot(page); await page.setViewportSize({ width: 1400, height: 872 }); await seed(page);
  for (const profile of profiles) {
    await page.locator('#projectSettingsBtn').click(); await page.locator('#profileSelect').selectOption(profile); await page.locator('#closeSettingsBtn').click();
    await page.locator('.bracket-hitbox[tabindex="0"]').first().press('Enter'); await settle(page); await abbreviationChecks(page);
    const types = await page.locator('#labelPicker button[data-relationship-type]').evaluateAll(buttons => buttons.map(b => b.dataset.relationshipType).sort());
    expect(types).toEqual(await page.evaluate(() => [...window.DA_PROFILES.getVisibleTypes()].sort()));
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => window.DA_PROFILES.setActiveById('gurtner'));
  await page.locator('.bracket-hitbox[tabindex="0"]').first().press('Enter'); await settle(page);
  const picker = page.locator('#labelPicker');
  await expect(picker.locator('button.action-manner .relationship-option-name')).toBeVisible();
  await expect(picker.locator('button.action-manner')).toHaveAccessibleName('方式关系 Way-End（W / Ed*）');
  await expect(picker.locator('button.action-manner')).toHaveAttribute('title', /方式关系 Way-End（W \/ Ed\*）/);
  const resize = async width => { const handle = await picker.locator('.picker-resize-handle').boundingBox(); const box = await picker.boundingBox(); await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + width - box.width, handle.y + handle.height / 2); await page.mouse.up(); await settle(page); };
  await resize(380); await abbreviationChecks(page);
  expect(await picker.locator('.relationship-option-name').first().evaluate(e => getComputedStyle(e).maxWidth)).not.toBe('none');
  await settle(page);
  await resize(320); await abbreviationChecks(page); await expect(picker.locator('button.action-manner .relationship-option-name')).toBeHidden();
  await settle(page);
  const input = picker.locator('.picker-search'); await input.fill('手段'); const handle = await input.elementHandle();
  await page.evaluate(() => window.DA_I18N.setPreference('en')); expect(await handle.evaluate(e => e.isConnected && e.value === '手段')).toBe(true);
  await page.evaluate(() => window.DA_I18N.setPreference('zh-CN')); await input.dispatchEvent('compositionstart'); await input.fill('方式');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 }); await expect(picker).toBeVisible();
  await input.dispatchEvent('compositionend'); await expect(picker.locator('button.action-manner')).toBeVisible();
  await input.press('Enter'); expect(await page.evaluate(() => window.DA_STATE.brackets[0].type)).toBe('action-manner'); expect(errors).toEqual([]);
});
test('import and parallel help localize the unchanged upstream English wording', async ({ page }) => {
  const errors = await boot(page, 'en');
  await page.locator('.import-section summary').click();
  await page.locator('#pasteText').fill('[1] Alpha beta gamma delta.');
  await page.locator('#importBtn').click();
  await page.evaluate(() => window.DA_UI.showParallelDialog());
  await page.evaluate(() => window.DA_I18N.setPreference('en'));
  await expect(page.locator('.status')).toContainText("Imported. Double-click to split a line, single-click to edit. Click the dots to create brackets.");
  await expect(page.locator('.parallel-dialog .hint-small')).toHaveText("Editable beside the text (splits with Enter in Text Edit mode) and saved with the project.");
  await page.evaluate(() => window.DA_I18N.setPreference('zh-CN'));
  await expect(page.locator('.status')).toContainText("已导入。双击可拆分行，单击可编辑。点击圆点可建立括号。");
  await expect(page.locator('.parallel-dialog .hint-small')).toHaveText("可在经文旁编辑（文字编辑模式下按 Enter 可拆分），并随项目保存。");
  await page.evaluate(() => window.DA_I18N.setPreference('zh-Hant'));
  await expect(page.locator('.status')).toContainText("已匯入。按兩下可拆分行，按一下可編輯。按一下圓點可建立括號。");
  await expect(page.locator('.parallel-dialog .hint-small')).toHaveText("可在經文旁編輯（文字編輯模式下按 Enter 可拆分），並隨專案儲存。");
  expect(errors).toEqual([]);
});
for (const script of ['greek', 'hebrew']) test(`original-script fonts direction and parallel text remain valid: ${script}`, async ({ page }) => {
  const errors = await boot(page); await page.setViewportSize({ width: 800, height: 572 });
  const hebrew = script === 'hebrew'; const text = hebrew ? ['בְּרֵאשִׁית בָּרָא אֱלֹהִים', 'וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ'] : ['Ἐν ἀρχῇ ἦν ὁ λόγος', 'καὶ ὁ λόγος ἦν πρὸς τὸν θεόν'];
  await seed(page, { ...fixture, propositions: text, verseRefs: ['1', '2'], brackets: [fixture.brackets[0]], parallelTexts: ['原文旁的中文用户文字一', '原文旁的中文用户文字二'], isRTL: hebrew, isHebrew: hebrew, isGreek: !hebrew, comments: [], mainPointSummary: '' });
  await theme(page, 'dark'); await page.evaluate(() => window.DA_UI.setZoomLevel(150)); await settle(page);
  await expect(page.locator('#propositions')).toHaveClass(hebrew ? /hebrew-text/ : /greek-text/);
  expect(await page.evaluate(() => window.DA_STATE.propositions)).toEqual(text);
  if (hebrew) expect(await page.locator('.proposition-text').first().evaluate(e => getComputedStyle(e).direction)).toBe('rtl');
  await settle(page);
  await page.evaluate(() => window.DA_BLOCK.setActive(true)); await settle(page);
  if (hebrew) expect(await page.locator('.bd-text').first().evaluate(e => getComputedStyle(e).direction)).toBe('rtl');
  await settle(page);
  await page.evaluate(() => window.DA_I18N.setPreference('en')); expect(await page.evaluate(() => window.DA_STATE.propositions)).toEqual(text); expect(errors).toEqual([]);
});
test('modal semantics, SVG opener restoration, icon names and draft focus survive language changes', async ({ page }) => {
  const errors = await boot(page); await seed(page);
  await page.locator('#projectSettingsBtn').click(); await expect(page.getByRole('dialog', { name: '项目设置' })).toBeVisible();
  await page.locator('#cloudProfileName').focus(); await page.keyboard.press('Tab');
  await page.evaluate(() => window.DA_I18N.setPreference('en')); expect(await page.evaluate(() => document.activeElement.closest('#settingsModal') !== null)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.locator('#projectSettingsBtn')).toBeFocused();
  const opener = page.locator('.bracket-hitbox[tabindex="0"]').first(); await opener.press('Enter'); await expect(page.locator('.picker-search')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await page.evaluate(() => window.DA_I18N.setPreference('zh-CN')); await expect(page.locator('#zoomOutBtn')).toHaveAccessibleName('缩小');
  await page.evaluate(() => window.DA_UI.showCommentPopover({ propIndex: 0, start: 0, end: 4, existingCommentId: 'visual-c1' }));
  await expect(page.locator('#commentPopover')).toHaveAttribute('role', 'dialog'); await expect(page.locator('#commentPopover .close-btn')).toHaveAccessibleName('关闭');
  await expect(page.locator('#commentPopover .send-reply-btn')).toHaveAccessibleName('发送回复');
  await page.locator('#commentPopover .reply-input').fill('Draft 原样'); await page.evaluate(() => window.DA_I18N.setPreference('en')); await expect(page.locator('#commentPopover .reply-input')).toHaveValue('Draft 原样');
  await page.locator('#commentPopover .close-btn').click();
  await theme(page, 'dark'); await page.locator('#openMenuBtn').click(); await page.locator('#openPicker > button').nth(1).click();
  await expect(page.locator('#openPicker input')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
