const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, load } = require('./helpers/harness');
function element(attrs = {}, tagName = 'SPAN') {
    return {
        nodeType: 1, tagName, children: [], childNodes: [], isConnected: true, textContent: 'Original',
        getAttribute: k => attrs[k] ?? null, setAttribute: (k, v) => {
            attrs[k] = v;
        }, querySelectorAll: () => [], attrs
    };
}
async function setup({ languages = ['en-US'], saved, native, blocked = false, nodes = [] } = {}) {
    const events = {};
    const html = { lang: 'en' };
    const s = createSandbox({ navigator: { languages }, document: { documentElement: html, readyState: 'complete',
            querySelectorAll: selector => selector === 'template' ? [] : nodes, addEventListener: () => {
            } },
        electronAPI: native ? { getSystemLanguages: async () => native } : undefined });
    if (saved !== undefined)
        s.localStorage.setItem('biblebracket_language', saved);
    if (blocked)
        s.localStorage = { getItem() {
                throw new Error('blocked');
            }, setItem() {
                throw new Error('blocked');
            } };
    s.addEventListener = (name, fn) => {
        events[name] = fn;
    };
    ['en.js', 'zh-CN.js', 'zh-Hant.js', 'i18n.js'].forEach(f => load(s, 'js/i18n/' + f));
    await s.DA_I18N.ready;
    return { s, i: s.DA_I18N, html, events };
}
test('default is Follow System without writing a preference', async () => {
    const { s, i } = await setup();
    assert.equal(i.getPreference(), 'system');
    assert.equal(i.getLocale(), 'en');
    assert.equal(s.localStorage.getItem(i.STORAGE_KEY), null);
});
for (const [tag, expected] of [['zh-CN', 'zh-CN'], ['zh-SG', 'zh-CN'], ['zh-Hans', 'zh-CN'], ['zh-Hans-MY', 'zh-CN'], ['zh', 'zh-CN'], ['zh-TW', 'zh-Hant'], ['zh-Hant-CN', 'zh-Hant'], ['fr-FR', 'en']]) {
    test('Follow System resolves ' + tag, async () => {
        const { i } = await setup({ languages: [tag] });
        assert.equal(i.getLocale(), expected);
    });
}
test('unsupported primary language falls back English, not an unrelated secondary choice', async () => {
    const { i } = await setup({ languages: ['fr-FR', 'zh-CN'] });
    assert.equal(i.getLocale(), 'en');
});
test('native system languages override the browser default for Follow System', async () => {
    const { i } = await setup({ native: ['zh-CN'] });
    assert.equal(i.getLocale(), 'zh-CN');
});
test('explicit English overrides a Chinese system', async () => {
    const { i } = await setup({ languages: ['zh-CN'], saved: 'en' });
    assert.equal(i.getLocale(), 'en');
    assert.equal(i.t('settings.open'), 'Settings');
});
test('explicit Chinese overrides an English system', async () => {
    const { i } = await setup({ saved: 'zh-CN' });
    assert.equal(i.t('settings.open'), '设置');
});
test('manual preference persists and is restored by a new instance', async () => {
    const { s, i } = await setup();
    i.setPreference('zh-CN');
    const next = await setup({ saved: s.localStorage.getItem(i.STORAGE_KEY) });
    assert.equal(next.i.getPreference(), 'zh-CN');
    assert.equal(next.i.getLocale(), 'zh-CN');
});
test('invalid stored preference returns to Follow System; invalid new choice is rejected', async () => {
    const { i } = await setup({ saved: 'bad' });
    assert.equal(i.getPreference(), 'system');
    assert.equal(i.setPreference('bad'), false);
});
test('blocked storage still permits current-session language switching', async () => {
    const { i } = await setup({ blocked: true });
    assert.equal(i.setPreference('zh-CN'), true);
    assert.equal(i.t('common.save'), '保存');
});
test('a missing Chinese key falls back to the full English catalog', async () => {
    const { s, i } = await setup({ saved: 'zh-CN' });
    s.DA_I18N_CATALOGS['zh-CN'] = {}; // Simulate a missing language entry without leaving production gaps.
    assert.equal(i.t('common.save'), 'Save');
});
test('missing keys and null params never yield blank or undefined', async () => {
    const { i } = await setup();
    assert.equal(i.t('nonexistent', null), 'Text unavailable');
    assert.equal(i.t('toString'), 'Text unavailable');
});
test('interpolation preserves data as plain text, with independently arranged Chinese word order', async () => {
    const { i } = await setup({ saved: 'zh-CN' });
    assert.equal(i.t('project.codeCopied', { code: '<img onerror=bad()>' }), '已复制项目代码 <img onerror=bad()>。');
});
test('plural count templates support English singular/plural and Chinese quantity', async () => {
    const { i } = await setup();
    assert.equal(i.t('relationship.removed', { count: 1 }), 'Bracket removed.');
    assert.equal(i.t('relationship.removed', { count: 2 }), '2 brackets removed.');
    i.setPreference('zh-CN');
    assert.equal(i.t('relationship.removed', { count: 2 }), '已删除 2 个括号。');
});
test('static binding and all supported attributes change immediately', async () => {
    const el = element({
        'data-i18n': 'common.save', 'data-i18n-title': 'settings.tooltip', 'data-i18n-placeholder': 'passage.placeholder', 'data-i18n-aria-label': 'relationship.filter', 'data-i18n-data-placeholder': 'summary.placeholder'
    });
    const { i, html } = await setup({ nodes: [el] });
    assert.equal(el.textContent, 'Save');
    i.setPreference('zh-CN');
    assert.equal(el.textContent, '保存');
    assert.equal(el.attrs.title, '项目与个人设置');
    assert.equal(el.attrs.placeholder, '例如 John 1:1-5、Romans 8:28');
    assert.equal(el.attrs['aria-label'], '筛选关系');
    assert.equal(el.attrs['data-placeholder'], '用自己的话概括这段经文的主旨…');
    assert.equal(html.lang, 'zh-CN');
});
test('binding never parses HTML or removes a button icon', async () => {
    const text = { nodeType: 3, textContent: 'Save' };
    const icon = { nodeType: 1 };
    const el = element({ 'data-i18n': 'common.save' }, 'BUTTON');
    el.children = [icon];
    el.childNodes = [icon, text];
    const { i } = await setup({ nodes: [el] });
    i.setPreference('zh-CN');
    assert.equal(text.textContent, '保存');
    assert.equal(el.childNodes[0], icon);
});
test('binding does not overwrite editable user content', async () => {
    const el = element({ 'data-i18n': 'common.save' });
    el.isContentEditable = true;
    el.textContent = 'User draft';
    const { i } = await setup({ nodes: [el] });
    i.setPreference('zh-CN');
    assert.equal(el.textContent, 'User draft');
});
test('dynamic text binding is refreshed without replacing its element', async () => {
    const el = element();
    const { i } = await setup({ nodes: [el] });
    i.bindText(el, 'project.codeCopied', { code: '123456' });
    assert.equal(el.textContent, 'Project code 123456 copied!');
    i.setPreference('zh-CN');
    assert.equal(el.textContent, '已复制项目代码 123456。');
});
test('change subscriptions can unsubscribe and do not write other storage', async () => {
    const { s, i } = await setup();
    let calls = 0;
    const off = i.onChange(() => calls++);
    i.setPreference('zh-CN');
    off();
    i.setPreference('en');
    assert.equal(calls, 1);
    assert.equal(s.localStorage.getItem('da_active_profile'), null);
    assert.equal(s.localStorage.getItem('biblebracket_draft'), null);
});
test('cross-window storage changes update the display without persisting again', async () => {
    const { i, events } = await setup();
    events.storage({ key: i.STORAGE_KEY, newValue: 'zh-CN' });
    assert.equal(i.getLocale(), 'zh-CN');
});
test('every Chinese key has a complete English baseline entry', async () => {
    const { s } = await setup();
    for (const key of Object.keys(s.DA_I18N_CATALOGS['zh-CN']))
        assert.ok(Object.hasOwn(s.DA_I18N_CATALOGS.en, key), key);
});
test('English plural fallback uses English rules even in Chinese UI', async () => {
    const { s, i } = await setup({ saved: 'zh-CN' });
    s.DA_I18N_CATALOGS['zh-CN'] = {};
    assert.equal(i.t('relationship.removed', { count: 1 }), 'Bracket removed.');
    assert.equal(i.t('relationship.removed', { count: 2 }), '2 brackets removed.');
});
test('Follow System responds to languagechange while manual English remains fixed', async () => {
    const {s, i, events} = await setup();
    s.navigator.languages = ['zh-CN'];
    await events.languagechange();
    assert.equal(i.getLocale(), 'zh-CN');
    i.setPreference('en');
    s.navigator.languages = ['zh-SG'];
    await events.languagechange();
    assert.equal(i.getLocale(), 'en');
});
test('choosing Follow System refreshes native preferences changed during manual mode', async () => {
    const native = ['en-US'];
    const {i} = await setup({native, saved:'en'});
    native[0] = 'zh-CN';
    i.setPreference('system');
    await i.ready;
    assert.equal(i.getLocale(), 'zh-CN');
});
