const { test, expect } = require('@playwright/test');
const fs = require('fs');
const fixture = {
    version: 3, passageRef: 'John 1:1-2', propositions: ['First user text', 'Second user text'], verseRefs: ['1', '2'], verseBreaks: [[], []], brackets: [{ id: 'br-i18n', type: 'ground', from: 'p0', to: 'p1' }], parallelLabel: 'CUV', parallelTexts: ['平行正文一', '平行正文二'], parallelHidden: false, mainPointSummary: 'User summary 原样', customLabels: [{ id: 'cl_user', name: 'User original label', label: 'X/Y*' }], comments: [{
            id: 'c-user', type: 'text', target: { propIndex: 0, start: 0, end: 5 }, text: 'User comment 原样', author: 'Tester', replies: [{ id: 'r-user', author: 'Other', text: 'Reply 原样' }]
        }], formatTags: [], wordArrows: [], indentation: [0, 0], bracketHighlights: {}, pageAuthor: 'I18n Tester'
};
async function boot(page, language = 'en') {
    await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    await page.addInitScript(language => {
        localStorage.setItem('biblebracket_reviewer_name', 'I18n Tester');
        localStorage.setItem('biblebracket_welcome_seen', 'true');
        localStorage.setItem('biblebracket_theme', 'light');
        if (language !== null && localStorage.getItem('biblebracket_language') === null)
            localStorage.setItem('biblebracket_language', language);
    }, language);
    await page.goto('/');
    await page.evaluate(() => window.DA_I18N.ready);
}
async function languageUI(page, language) {
    await page.locator('#projectSettingsBtn').click();
    await page.locator('#interfaceLanguage').selectOption(language);
    await page.locator('#closeSettingsBtn').click();
}
async function importFixture(page) {
    await page.locator('#importFileInput').setInputFiles({ name: 'project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await expect(page.locator('.proposition-block')).toHaveCount(2);
}
async function snapshot(page) {
    return page.evaluate(() => {
        const data = window.DA_EXPORT.buildBracketData();
        delete data.exportedAt;
        return {
            data, profile: window.DA_PROFILES.getActive(), undo: window.DA_STATE.undoStack, redo: window.DA_STATE.redoStack, cloudDirty: window.DA_STATE.cloudDirty
        };
    });
}
async function picker(page) {
    // SVG lines have zero width; use the app's supported keyboard entry path.
    await page.locator('.bracket-hitbox[tabindex="0"]').first().press('Enter');
    await expect(page.locator('#labelPicker')).toBeVisible();
}
for (const [locale, want] of [['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-TW', 'zh-Hant'], ['fr-FR', 'en']]) {
    test('default Follow System: ' + locale, async ({ browser }) => {
        const context = await browser.newContext({ locale });
        const page = await context.newPage();
        await boot(page, null);
        await expect(page.locator('html')).toHaveAttribute('lang', want);
        expect(await page.evaluate(() => window.DA_I18N.getPreference())).toBe('system');
        await context.close();
    });
}
test('manual language, marked attributes, icons and restart persistence', async ({ page }) => {
    await boot(page);
    await languageUI(page, 'zh-CN');
    await expect(page.locator('#fetchBtn')).toHaveText('载入经文');
    await expect(page.locator('#passageInput')).toHaveAttribute('placeholder', '例如 John 1:1-5、Romans 8:28');
    await expect(page.locator('#projectSettingsBtn')).toHaveAttribute('title', '项目与个人设置');
    await expect(page.locator('#summaryText')).toHaveAttribute('aria-label', '经文主旨摘要');
    await expect(page.locator('#summaryText')).toHaveAttribute('data-placeholder', '用自己的话概括这段经文的主旨…');
    await expect(page.locator('#projectSettingsBtn svg')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    expect(await page.evaluate(() => window.DA_I18N.getPreference())).toBe('zh-CN');
    await languageUI(page, 'en');
    await expect(page.locator('#fetchBtn')).toHaveText('Fetch Passage');
    await languageUI(page, 'system');
    expect(await page.evaluate(() => window.DA_I18N.getPreference())).toBe('system');
});
test('English save → Chinese open → English preserves all document fields and current profile', async ({ page }) => {
    await boot(page);
    await importFixture(page);
    const before = await snapshot(page);
    await page.locator('#exportMenuBtn').click();
    const pending = page.waitForEvent('download');
    await page.locator('#exportMenu [data-action="json"]').click();
    const download = await pending;
    const saved = await download.path();
    const json = JSON.parse(fs.readFileSync(saved, 'utf8'));
    expect(json).not.toHaveProperty('language');
    expect(json).not.toHaveProperty('locale');
    await languageUI(page, 'zh-CN');
    expect(await snapshot(page)).toEqual(before);
    await page.locator('#importFileInput').setInputFiles(saved);
    const chinese = await snapshot(page);
    expect(chinese.data).toEqual(before.data);
    expect(chinese.profile).toEqual(before.profile);
    await languageUI(page, 'en');
    expect(await snapshot(page)).toEqual(chinese);
});
test('language changes preserve profile draft, focus and cursor without recreating the editor', async ({ page }) => {
    await boot(page);
    await page.locator('#projectSettingsBtn').click();
    await page.locator('.advanced-notation > summary').click();
    const input = page.locator('.notation-name').first();
    await input.fill('Uncommitted teacher name');
    await input.evaluate(el => el.setSelectionRange(4, 10));
    const handle = await input.elementHandle();
    const before = await page.evaluate(() => JSON.stringify(window.DA_PROFILES.getActive()));
    await page.evaluate(() => window.DA_I18N.setPreference('zh-CN'));
    expect(await handle.evaluate(el => ({
        connected: el.isConnected, value: el.value, start: el.selectionStart, end: el.selectionEnd, focused: document.activeElement === el
    }))).toEqual({
        connected: true, value: 'Uncommitted teacher name', start: 4, end: 10, focused: true
    });
    expect(await page.evaluate(() => JSON.stringify(window.DA_PROFILES.getActive()))).toBe(before);
});
test('Chinese and English searches and live picker labels retain the search node', async ({ page }) => {
    await boot(page);
    await importFixture(page);
    await picker(page);
    const input = page.locator('.picker-search');
    await input.fill('理由');
    await expect(page.locator('#labelPicker button.ground')).toBeVisible();
    const handle = await input.elementHandle();
    await page.evaluate(() => window.DA_I18N.setPreference('zh-CN'));
    await expect(page.locator('#labelPicker button.ground')).toHaveAccessibleName('理由 Ground（* / G）');
    await expect(page.locator('#labelPicker button.ground .relationship-option-abbr')).toHaveText('* / G');
    expect(await handle.evaluate(el => el.isConnected && el.value === '理由')).toBe(true);
    await input.fill('Ground');
    await expect(page.locator('#labelPicker button.ground')).toBeVisible();
    await input.fill('Ac/Pur');
    await expect(page.locator('#labelPicker button.action-purpose')).toBeVisible();
    await input.press('Enter');
    expect(await page.evaluate(() => window.DA_STATE.brackets[0].type)).toBe('action-purpose');
    await expect(page.locator('.status')).toHaveText('已将标签改为 行动—目的 Action-Purpose (Ac/Pur)。');
    await page.evaluate(() => window.DA_I18N.setPreference('en'));
    await expect(page.locator('.status')).toHaveText('Label changed to Action-Purpose (Ac/Pur)');
});
test('IME composition does not select a relationship before commit', async ({ page }) => {
    await boot(page, 'zh-CN');
    await importFixture(page);
    await picker(page);
    const input = page.locator('.picker-search');
    await input.dispatchEvent('compositionstart');
    await input.fill('推论');
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
    await expect(page.locator('#labelPicker')).toBeVisible();
    expect(await page.evaluate(() => window.DA_STATE.brackets[0].type)).toBe('ground');
    await input.dispatchEvent('compositionend');
    await expect(page.locator('#labelPicker button.inference')).toBeVisible();
    await input.press('Enter');
    expect(await page.evaluate(() => window.DA_STATE.brackets[0].type)).toBe('inference');
});
test('guide follows profile names, approved help and immediate locale changes', async ({ page }) => {
    await boot(page, 'zh-CN');
    await page.locator('#projectSettingsBtn').click();
    await page.locator('#profileSelect').selectOption('schreiner');
    await page.locator('#closeSettingsBtn').click();
    await page.locator('.sidebar-help > summary').click();
    await page.locator('#openReferenceGuideBtn').click();
    await expect(page.locator('#referenceTableBody')).toContainText('双向支持 Bilateral');
    await expect(page.locator('#referenceTableBody')).toContainText('中间命题作为根据，支持其前后两边');
    await expect(page.locator('#referenceTableBody')).toContainText('中央命题受到前后两侧理由的支持');
    await page.evaluate(() => window.DA_I18N.setPreference('en'));
    await expect(page.locator('#referenceGuideTitle')).toHaveText('Logical Relationships Guide — Schreiner');
    await expect(page.locator('#referenceTableBody')).not.toContainText('双向支持');
});
test('dynamic menu, translated template draft and safe interpolated status', async ({ page }) => {
    await boot(page, 'zh-CN');
    await importFixture(page);
    await page.locator('#exportMenuBtn').click();
    await expect(page.locator('#exportMenu [data-action="png"]')).toHaveText('导出 PNG 图片');
    await expect(page.locator('#exportMenu [data-action="cloud-toggle"]')).toHaveText('开启云同步');
    await page.keyboard.press('Escape');
    await page.locator('.bracket-hitbox').first().click({ button: 'right', force: true });
    await page.locator('#bracketActions [data-action="comment"]').click();
    const draft = page.locator('#commentPopover .new-comment-area textarea');
    await expect(draft).toHaveAttribute('placeholder', '添加评论…');
    await draft.fill('Unsent draft <img src=x onerror=alert(1)>');
    await page.evaluate(() => window.DA_I18N.setPreference('en'));
    await expect(draft).toHaveValue('Unsent draft <img src=x onerror=alert(1)>');
    await expect(draft).toHaveAttribute('placeholder', 'Add a comment...');
    await page.evaluate(() => window.DA_UI.showTranslatedStatus('project.codeCopied', { code: '<img src=x onerror=alert(1)>' }, 'success'));
    await expect(page.locator('.status')).toHaveText('Project code <img src=x onerror=alert(1)> copied!');
    await expect(page.locator('.status img')).toHaveCount(0);
});
test('translated confirmation preserves cancel and document data', async ({ page }) => {
    await boot(page, 'zh-CN');
    await importFixture(page);
    const before = await snapshot(page);
    page.once('dialog', async (dialog) => {
        expect(dialog.message()).toBe('确定清除所有括号和格式？');
        await dialog.dismiss();
    });
    await page.locator('#clearBrackets').click();
    expect(await snapshot(page)).toEqual(before);
});
test('summary editable selection and contents survive a language change', async ({page}) => {
    await boot(page);
    await importFixture(page);
    const summary = page.locator('#summaryText');
    await summary.evaluate(el => {
        el.focus();
        const range = document.createRange();
        range.setStart(el.firstChild, 2);
        range.setEnd(el.firstChild, 8);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    });
    const before = await page.evaluate(() => ({text: window.getSelection().toString(), state: window.DA_STATE.mainPointSummary, undo: JSON.stringify(window.DA_STATE.undoStack)}));
    await page.evaluate(() => window.DA_I18N.setPreference('zh-CN'));
    expect(await summary.evaluate(el => document.activeElement === el)).toBe(true);
    expect(await page.evaluate(() => ({text: window.getSelection().toString(), state: window.DA_STATE.mainPointSummary, undo: JSON.stringify(window.DA_STATE.undoStack)}))).toEqual(before);
});
test('custom relationship display and name remain verbatim in both languages', async ({page}) => {
    await boot(page);
    await importFixture(page);
    await picker(page);
    const custom = page.locator('#labelPicker button.cl_user');
    await expect(custom).toHaveText('User original label (X/Y*)');
    await page.evaluate(() => window.DA_I18N.setPreference('zh-CN'));
    await expect(custom).toHaveText('User original label (X/Y*)');
});
