const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const fixture = {
  version: 3, passageRef: 'John 1:1-2', propositions: ['In the beginning was the Word.', '用户简体经文保持原样。'],
  verseRefs: ['1', '2'], verseBreaks: [[], []], brackets: [{ id: 'hant-br', type: 'ground', from: 'p0', to: 'p1' }],
  comments: [{ id: 'hant-c', type: 'text', target: { propIndex: 0, start: 0, end: 2 }, text: '用户简体评论', author: '测试用户',
    replies: [{ id: 'hant-r', author: 'Reply user', text: '用户简体回复' }] }],
  mainPointSummary: '用户简体摘要保持原样', parallelLabel: 'CUV', parallelTexts: ['平行经文原样', 'Parallel text'], parallelHidden: false,
  pageAuthor: '用户简体姓名', customLabels: [{ id: 'cl_hant', name: '用户简体关系', label: 'X/Y*' }],
  formatTags: [], indentation: [0, 0], wordArrows: [], bracketHighlights: {}
};
const profiles = ['josiah', 'biblearc', 'gurtner', 'beale', 'schreiner'];
async function boot(page, language = 'zh-Hant') {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.addInitScript(language => {
    localStorage.setItem('biblebracket_welcome_seen', 'true');
    localStorage.setItem('biblebracket_reviewer_name', 'Hant QA');
    if (!localStorage.getItem('biblebracket_language')) localStorage.setItem('biblebracket_language', language);
  }, language);
  await page.goto('/'); await page.evaluate(() => window.DA_I18N.ready); return errors;
}
async function seed(page, data = fixture) {
  await page.locator('#importFileInput').setInputFiles({ name: '繁體 UI 简体项目.JSON', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('.proposition-text')).toHaveCount(data.propositions.length); await settle(page);
}
async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
}
async function picker(page) { await page.locator('.bracket-hitbox[tabindex="0"]').first().press('Enter'); await expect(page.locator('#labelPicker')).toBeVisible(); }
async function snapshot(page) { return page.evaluate(() => {
  const data = window.DA_EXPORT.buildBracketData(); delete data.exportedAt;
  return { data, undo: window.DA_STATE.undoStack, redo: window.DA_STATE.redoStack, dirty: window.DA_STATE.cloudDirty };
}); }

async function abbreviationChecks(page) {
  expect(await page.locator('#labelPicker button.relationship-option').evaluateAll(buttons => buttons.flatMap(b => {
    const a = b.querySelector('.relationship-option-abbr'), r = a.getBoundingClientRect(), box = b.getBoundingClientRect();
    return a.textContent !== window.DA_PROFILES.getAbbr(b.dataset.relationshipType) || a.scrollWidth > a.clientWidth + 1
      || r.left < box.left - 1 || r.right > box.right + 1 || getComputedStyle(a).textOverflow === 'ellipsis' ? [b.dataset.relationshipType] : [];
  }))).toEqual([]);
}
for (const [locale, expected] of [['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-MO', 'zh-Hant'], ['zh-Hans-TW', 'zh-CN']])
  test('Hant browser Follow System ' + locale, async ({ browser }) => {
    const context = await browser.newContext({ locale }); const page = await context.newPage(); await boot(page, 'system');
    await expect(page.locator('html')).toHaveAttribute('lang', expected); await context.close();
  });
test('four language choices, live settings attributes and Hant preference across reload', async ({ page }) => {
  const errors = await boot(page); await page.locator('#projectSettingsBtn').click();
  await expect(page.locator('#interfaceLanguage option')).toHaveText(['跟隨系統', 'English', '簡體中文', '繁體中文']);
  await expect(page.locator('#settingsModal')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#closeSettingsBtn')).toHaveAccessibleName('關閉設定');
  await page.locator('#interfaceLanguage').selectOption('zh-CN');
  await expect(page.locator('#interfaceLanguage option')).toHaveText(['跟随系统', 'English', '简体中文', '繁體中文']);
  await page.locator('#interfaceLanguage').selectOption('en');
  await expect(page.locator('#interfaceLanguage option')).toHaveText(['Follow System', 'English', '简体中文', '繁體中文']);
  await page.locator('#interfaceLanguage').selectOption('zh-Hant'); await page.locator('#closeSettingsBtn').click(); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant'); await expect(page.locator('#zoomOutBtn')).toHaveAccessibleName('縮小');
  expect(errors).toEqual([]);
});
test('full language cycle preserves JSON, user text, graph, history, focus, selection, and no passage refetch', async ({ page }) => {
  await boot(page, 'zh-CN'); await seed(page); let passageCalls = 0;
  page.on('request', r => { if (/bolls|api\.esv|netlify|SBLGNT/i.test(r.url())) passageCalls++; });
  const summary = page.locator('#summaryText'); await summary.evaluate(el => {
    el.focus(); const r = document.createRange(); r.setStart(el.firstChild, 1); r.setEnd(el.firstChild, 4);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  const before = await snapshot(page), selection = await page.evaluate(() => getSelection().toString());
  for (const language of ['en', 'zh-CN', 'zh-Hant', 'system', 'en']) {
    await page.evaluate(language => window.DA_I18N.setPreference(language), language);
    expect(await snapshot(page)).toEqual(before);
    expect(await summary.evaluate(el => document.activeElement === el)).toBe(true);
    expect(await page.evaluate(() => getSelection().toString())).toBe(selection);
  }
  expect(passageCalls).toBe(0);
  expect(JSON.stringify(before.data)).not.toMatch(/"(?:locale|language|script|traditional)"\s*:/);
});
test('live Hant translation preserves unsent comment/reply drafts and template input focus', async ({ page }) => {
  await boot(page); await seed(page);
  await page.evaluate(() => window.DA_UI.showCommentPopover({ propIndex: 0, start: 0, end: 2, existingCommentId: 'hant-c' }));
  const reply = page.locator('#commentPopover .reply-input'); await reply.fill('未发送简体 reply draft');
  await reply.evaluate(el => { el.focus(); el.setSelectionRange(2, 4); });
  for (const lang of ['en', 'zh-CN', 'zh-Hant']) {
    await page.evaluate(lang => window.DA_I18N.setPreference(lang), lang);
    await expect(reply).toHaveValue('未发送简体 reply draft'); await expect(reply).toBeFocused();
    expect(await reply.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([2, 4]);
  }
  await expect(reply).toHaveAttribute('placeholder', '回覆…');
  await expect(page.locator('#commentPopover .send-reply-btn')).toHaveAccessibleName('傳送回覆');
  await settle(page); await page.locator('#commentPopover .close-btn').click();
  await page.evaluate(() => window.DA_UI.showCommentPopover({ propIndex: 1, start: 0, end: 2 }));
  const comment = page.locator('#commentPopover .new-comment-area textarea'); await comment.fill('新评论草稿');
  await page.evaluate(() => window.DA_I18N.setPreference('en')); await expect(comment).toHaveValue('新评论草稿');
});
test('profile editable draft and relationship search input survive language switching', async ({ page }) => {
  await boot(page); await seed(page); await page.locator('#projectSettingsBtn').click();
  await page.locator('.advanced-notation > summary').click(); const name = page.locator('#cloudProfileName');
  await name.fill('未发布简体 profile 草稿'); await name.focus(); await page.evaluate(() => window.DA_I18N.setPreference('en'));
  await expect(name).toHaveValue('未发布简体 profile 草稿'); await expect(name).toBeFocused();
  await page.locator('#closeSettingsBtn').click(); await picker(page); const search = page.locator('.picker-search'); await search.fill('推論');
  const handle = await search.elementHandle(); await page.evaluate(() => window.DA_I18N.setPreference('zh-Hant'));
  expect(await handle.evaluate(el => el.isConnected && document.activeElement === el && el.value === '推論')).toBe(true);
});
for (const language of ['en', 'zh-CN', 'zh-Hant']) test('three-script relationship search and IME in ' + language, async ({ page }) => {
  await boot(page, language); await seed(page); await page.evaluate(() => window.DA_PROFILES.setActiveById('schreiner')); await picker(page);
  const search = page.locator('.picker-search');
  for (const [type, words] of [['ground', ['理據', '理由', 'Ground', 'G']], ['inference', ['推论', '推論', 'Inference']],
    ['action-purpose', ['行动', '行動', 'Ac / Pur']], ['bilateral', ['BL', '雙邊的']], ['double-ground', ['DG', '雙重理據', '雙側理由']]]) {
    for (const word of words) { await search.fill(word); await expect(page.locator('#labelPicker button.' + type)).toBeVisible(); }
  }
  await search.dispatchEvent('compositionstart'); await search.fill('推論');
  await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await expect(page.locator('#labelPicker')).toBeVisible(); expect(await page.evaluate(() => window.DA_STATE.brackets[0].type)).toBe('ground');
  await search.dispatchEvent('compositionend'); await search.press('Enter');
  expect(await page.evaluate(() => window.DA_STATE.brackets[0].type)).toBe('inference');
});
test('Schreiner Guide and selector use publication terms plus course Double Ground without contaminating BibleArc', async ({ page }) => {
  await boot(page); await seed(page);
  await page.evaluate(() => { window.DA_PROFILES.setActiveById('schreiner'); window.DA_UI.openReferenceGuide(); });
  await expect(page.locator('#referenceTableBody')).toContainText('連續性 Series（S）');
  await expect(page.locator('#referenceTableBody')).toContainText('雙重理據 Double Ground（DG）');
  await expect(page.locator('#referenceTableBody')).toContainText('以再陳述輔助');
  await settle(page); await page.locator('#closeReferenceBtn').click(); await picker(page);
  await expect(page.locator('#labelPicker button.double-ground')).toHaveAccessibleName('雙重理據 Double Ground（DG）');
  await page.locator('#labelPicker button.double-ground').focus(); await expect(page.locator('.info-name')).toHaveText('雙重理據 Double Ground（DG）');
  await settle(page); await page.keyboard.press('Escape');
  await page.evaluate(() => { window.DA_PROFILES.setActiveById('biblearc'); window.DA_UI.openReferenceGuide(); });
  await expect(page.locator('#referenceTableBody')).toContainText('並列列舉 Series（S）');
  await expect(page.locator('#referenceTableBody')).toContainText('以重述支持');
  await expect(page.locator('#referenceTableBody')).not.toContainText('連續性');
});
test('Hant selector compresses Chinese first and preserves exact raw notation at 480 / 380 / 320 widths', async ({ page }) => {
  await boot(page); await page.setViewportSize({ width: 1400, height: 900 }); await seed(page);
  await page.evaluate(() => window.DA_PROFILES.setActiveById('gurtner')); await picker(page);
  const box = page.locator('#labelPicker');
  for (const width of [480, 380, 320]) {
    const handle = await box.locator('.picker-resize-handle').boundingBox(), before = await box.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + width - before.width, handle.y + handle.height / 2); await page.mouse.up(); await settle(page);
    await abbreviationChecks(page);
    await expect(box.locator('button.action-manner')).toHaveAccessibleName('方式關係 Way-End（W / Ed*）');
    if (width === 320) await expect(box.locator('button.action-manner .relationship-option-name')).toBeHidden();
  }
  await settle(page);
});
const conditions = [[800, 600, 90, 'light'], [800, 600, 150, 'dark'], [1400, 900, 100, 'light'],
  [1400, 900, 125, 'dark'], [1460, 900, 100, 'dark'], [1460, 900, 150, 'light']];
for (const [width, height, zoom, mode] of conditions) test(`Hant representative layout ${width}x${height} ${zoom}% ${mode}`, async ({ page }) => {
  const errors = await boot(page); await page.setViewportSize({ width, height }); await seed(page);
  await page.evaluate(({ mode, zoom }) => {
    if (document.documentElement.getAttribute('data-theme') !== mode) window.DA_UI.toggleTheme(); window.DA_UI.setZoomLevel(zoom);
  }, { mode, zoom }); await settle(page);
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
  await settle(page);
  await page.locator('#projectSettingsBtn').click(); await settle(page);
  expect(await page.locator('#settingsModal .modal-body').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  const rect = await page.locator('#settingsModal .modal-content').boundingBox(); expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(height + 1);
  await settle(page); await page.locator('#closeSettingsBtn').click();
  for (const profile of profiles) {
    await page.evaluate(profile => { window.DA_PROFILES.setActiveById(profile); window.DA_UI.openReferenceGuide(); }, profile); await settle(page);
    expect(await page.locator('#referenceModal .modal-body').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await expect(page.locator('#referenceTableBody')).toContainText(profile === 'schreiner' ? '以額外陳述輔助' : '以不同陳述支持');
    await page.locator('#closeReferenceBtn').click(); await picker(page); await settle(page); await abbreviationChecks(page); await page.keyboard.press('Escape');
  }
  await page.evaluate(() => window.DA_BLOCK.setActive(true)); await settle(page);
  await page.locator('#alternateViewsBtn').click();
  await expect(page.locator('#alternateViewsMenu [data-action="block-diagram"]')).toHaveText('括號檢視 (B)');
  await page.keyboard.press('Escape');
  await settle(page); expect(errors).toEqual([]);
});
for (const script of ['Greek', 'Hebrew']) test('Hant UI preserves original-script font and direction: ' + script, async ({ page }) => {
  await boot(page); const hebrew = script === 'Hebrew';
  const text = hebrew ? ['בְּרֵאשִׁית בָּרָא אֱלֹהִים', 'וְהָאָרֶץ הָיְתָה תֹהוּ'] : ['Ἐν ἀρχῇ ἦν ὁ λόγος', 'καὶ ὁ λόγος ἦν πρὸς τὸν θεόν'];
  await seed(page, { ...fixture, propositions: text, isRTL: hebrew, isHebrew: hebrew, isGreek: !hebrew });
  const beforeFont = await page.locator('.proposition-text').first().evaluate(e => getComputedStyle(e).fontFamily);
  await page.evaluate(() => window.DA_I18N.setPreference('en'));
  expect(await page.locator('.proposition-text').first().evaluate(e => getComputedStyle(e).fontFamily)).toBe(beforeFont);
  if (hebrew) expect(await page.locator('.proposition-text').first().evaluate(e => getComputedStyle(e).direction)).toBe('rtl');
  expect(await page.evaluate(() => window.DA_STATE.propositions)).toEqual(text);
});
test('Hant dynamic menu, confirmation direction, safe HTML interpolation and custom name', async ({ page }) => {
  await boot(page); await seed(page); await page.locator('#exportMenuBtn').click();
  await expect(page.locator('#exportMenu [data-action="png"]')).toHaveText('匯出 PNG 圖片'); await page.keyboard.press('Escape');
  await page.evaluate(() => { window.DA_STATE.parallelLabel = 'ESV'; window.DA_UI.showParallelDialog(); });
  await page.locator('#parallelTranslationSelect').selectOption('NASB');
  page.once('dialog', async d => { expect(d.message()).toBe('確定以 NASB 取代目前的 ESV 欄（包含所有編輯內容）？可按 Ctrl+Z 復原。'); await d.dismiss(); });
  await page.locator('#parallelShowBtn').click();
  expect(await page.evaluate(() => window.DA_STATE.parallelLabel)).toBe('ESV');
  await page.evaluate(() => window.DA_UI.showTranslatedStatus('project.codeCopied', { code: '<img src=x onerror=alert(1)>' }, 'success'));
  await expect(page.locator('.status img')).toHaveCount(0); await expect(page.locator('.status')).toContainText('<img src=x');
  await picker(page); await expect(page.locator('#labelPicker button.cl_hant')).toHaveText('用户简体关系 (X/Y*)');
});
test('Hant JSON / PNG / PDF exports restore the unchanged project and contain no UI locale', async ({ page }) => {
  test.setTimeout(60000); await boot(page, 'zh-CN'); await seed(page); const before = (await snapshot(page)).data;
  await page.evaluate(() => window.DA_I18N.setPreference('zh-Hant'));
  for (const [action, ext] of [['json', 'json'], ['png', 'png'], ['pdf', 'pdf']]) {
    await page.locator('#exportMenuBtn').click(); const pending = page.waitForEvent('download');
    await page.locator(`#exportMenu [data-action="${action}"]`).click(); const download = await pending;
    const output = test.info().outputPath('project.' + ext); await download.saveAs(output);
    expect(fs.statSync(output).size).toBeGreaterThan(100);
    await page.evaluate(() => window.DA_PERSISTENCE.importBracket({ version: 3, passageRef: 'Sentinel', propositions: ['Different content before restore'], verseRefs: ['1'], brackets: [], comments: [], mainPointSummary: '' }));
    await expect(page.locator('.proposition-text')).toHaveCount(1);
    await page.locator('#openMenuBtn').click(); const chooser = page.waitForEvent('filechooser');
    await page.locator('#openPicker > button').first().click(); await (await chooser).setFiles(output);
    await expect(page.locator('.proposition-text')).toHaveCount(2);
    const after = (await snapshot(page)).data; expect(after).toEqual(before);
  }
  await page.evaluate(() => window.DA_I18N.setPreference('en')); expect((await snapshot(page)).data).toEqual(before);
});
