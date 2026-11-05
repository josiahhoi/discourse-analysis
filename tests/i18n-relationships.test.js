const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, load } = require('./helpers/harness');
async function setup() {
    const s = createSandbox({ navigator: { languages: ['en-US'] } });
    ['js/i18n/en.js', 'js/i18n/zh-CN.js', 'js/i18n/zh-Hant.js', 'js/i18n/i18n.js', 'js/utils/constants.js', 'js/services/state.js', 'js/services/profiles.js', 'js/i18n/relationships.js', 'js/services/export-service.js'].forEach(f => load(s, f));
    await s.DA_I18N.ready;
    return s;
}
const plain = value => JSON.parse(JSON.stringify(value));
test('all 92 builtin rows preserve raw profile data and English names across locale changes', async () => {
    const s = await setup();
    let rows = 0;
    for (const id of Object.keys(s.DA_PROFILES.builtins())) {
        s.DA_PROFILES.setActiveById(id);
        s.DA_I18N.setPreference('en');
        const before = JSON.stringify(s.DA_PROFILES.getActive());
        for (const type of s.DA_PROFILES.getVisibleTypes()) {
            assert.equal(s.DA_RELATIONSHIPS.getName(type), s.DA_PROFILES.getName(type));
            rows++;
        }
        s.DA_I18N.setPreference('zh-CN');
        for (const type of s.DA_PROFILES.getVisibleTypes())
            assert.notEqual(s.DA_RELATIONSHIPS.getName(type), 'Text unavailable');
        assert.equal(JSON.stringify(s.DA_PROFILES.getActive()), before);
    }
    assert.equal(rows, 92);
});
test('approved Chinese names retain distinct profile English vocabulary', async () => {
    const s = await setup();
    s.DA_I18N.setPreference('zh-CN');
    s.DA_PROFILES.setActiveById('josiah');
    assert.equal(s.DA_RELATIONSHIPS.getName('ground'), '理由 Ground (G)');
    assert.match(s.DA_RELATIONSHIPS.getName('action-manner'), /^行动—方式 Action-Manner/);
    s.DA_PROFILES.setActiveById('gurtner');
    assert.equal(s.DA_RELATIONSHIPS.getName('action-manner'), '方式关系 Way-End (W/Ed)');
    assert.match(s.DA_RELATIONSHIPS.getName('concessive'), /^逆接 Adversative/);
    assert.match(s.DA_RELATIONSHIPS.getName('action-purpose'), /^手段—目的 Means-End/);
});
test('Bilateral translations preserve upstream preceding and following support directions', async () => {
    const s = await setup();
    const { bilateralDefinitions } = require('./fixtures/i18n-relationships.json');
    for (const [locale, expected] of Object.entries(bilateralDefinitions)) {
        s.DA_I18N.setPreference(locale);
        assert.equal(s.DA_RELATIONSHIPS.getDefinition('bilateral'), expected);
    }
    assert.equal(bilateralDefinitions.en, s.DA_CONSTANTS.RELATIONSHIP_DEFINITIONS.bilateral.definition);
    s.DA_I18N.setPreference('zh-CN');
    assert.match(s.DA_RELATIONSHIPS.getDefinition('double-ground'), /中央命题受到前后两侧理由的支持/);
});
test('Way-End, Alternative, Idea-Explanation and Adversative use approved help boundaries', async () => {
    const s = await setup();
    s.DA_I18N.setPreference('zh-CN');
    s.DA_PROFILES.setActiveById('gurtner');
    assert.match(s.DA_RELATIONSHIPS.getDefinition('action-manner'), /以何种方式实行/);
    assert.match(s.DA_RELATIONSHIPS.getDefinition('concessive'), /不把所有普通转折/);
    s.DA_PROFILES.setActiveById('josiah');
    assert.match(s.DA_RELATIONSHIPS.getDefinition('alternative'), /不表示.*排他/);
    assert.match(s.DA_RELATIONSHIPS.getDefinition('idea-explanation'), /一个词或整个命题/);
});
test('Chinese search names work even when English is the active UI', async () => {
    const s = await setup();
    const idx = s.DA_PROFILES.searchIndexFor('ground');
    assert.equal(s.DA_PROFILES.matchesSearch(idx.nameBlob, '理由'), true);
    assert.equal(s.DA_PROFILES.matchesSearch(idx.nameBlob, '推论'), false);
});
test('English, original abbreviations, other profiles and existing keywords still match', async () => {
    const s = await setup();
    const p = s.DA_PROFILES;
    assert.ok(p.matchesSearch(p.searchIndexFor('ground').nameBlob, 'Ground'));
    assert.ok(p.matchesSearch(p.searchIndexFor('ground').keywordBlob, 'because'));
    const idx = p.searchIndexFor('action-purpose');
    for (const q of ['Ac/Pur', 'means', '手段—目的', '行动—目的', 'Ａｃ／Ｐｕｒ'])
        assert.ok(p.matchesSearch(idx.nameBlob, q), q);
});
test('custom profile and user-renamed relationship names are not translated or saved as Chinese', async () => {
    const s = await setup();
    const custom = plain(s.DA_PROFILES.builtins().josiah);
    custom.id = 'custom';
    custom.builtin = false;
    custom.name = 'Professor original';
    custom.labels.ground.name = 'My Ground <unchanged>';
    s.DA_PROFILES.setActive(custom);
    const before = JSON.stringify(s.DA_PROFILES.getActive());
    s.DA_I18N.setPreference('zh-CN');
    assert.equal(s.DA_RELATIONSHIPS.getName('ground'), 'My Ground <unchanged>');
    assert.equal(JSON.stringify(s.DA_PROFILES.getActive()), before);
});
test('a modified name cannot be translated just by carrying builtin=true', async () => {
    const s = await setup();
    const p = plain(s.DA_PROFILES.builtins().josiah);
    p.labels.ground.name = 'Teacher choice';
    s.DA_PROFILES.setActive(p);
    s.DA_I18N.setPreference('zh-CN');
    assert.equal(s.DA_RELATIONSHIPS.getName('ground'), 'Teacher choice');
});
test('custom cl_ label name and symbol stay verbatim in display', async () => {
    const s = await setup();
    s.DA_STATE.customLabels = [{ id: 'cl_one', name: 'My Relation', label: 'L/R*' }];
    s.DA_I18N.setPreference('zh-CN');
    assert.equal(s.DA_RELATIONSHIPS.getName('cl_one'), 'My Relation (L/R*)');
});
test('existing display aliases do not merge stored IDs', async () => {
    const s = await setup();
    s.DA_STATE.brackets = [{ id: 'br-one', type: 'general-specific', from: 'p0', to: 'p1' }];
    s.DA_I18N.setPreference('zh-CN');
    assert.match(s.DA_RELATIONSHIPS.getName('general-specific'), /^意思—解释 Idea-Explanation/);
    assert.equal(s.DA_STATE.brackets[0].type, 'general-specific');
});
test('project JSON and undo/redo remain unchanged while switching UI languages', async () => {
    const s = await setup();
    Object.assign(s.DA_STATE, {
        passageRef: 'John 1:1-2', propositions: ['User text', 'Second'], verseRefs: ['1', '2'], verseBreaks: [[], []], parallelTexts: ['平行正文', 'Other'], parallelLabel: 'CUV', comments: [{ id: 'c1', text: 'User comment', author: 'User', replies: [] }], mainPointSummary: 'User summary', brackets: [{ id: 'br1', type: 'ground', from: 'p0', to: 'p1' }]
    });
    const data = () => {
        const j = plain(s.DA_EXPORT.buildBracketData());
        delete j.exportedAt;
        return j;
    };
    const before = data();
    const history = JSON.stringify([s.DA_STATE.undoStack, s.DA_STATE.redoStack]);
    s.DA_I18N.setPreference('zh-CN');
    assert.deepEqual(data(), before);
    s.DA_I18N.setPreference('en');
    assert.deepEqual(data(), before);
    assert.equal(JSON.stringify([s.DA_STATE.undoStack, s.DA_STATE.redoStack]), history);
    assert.equal('language' in before, false);
    assert.equal('locale' in before, false);
});
test('language preference cannot mark cloud state dirty or create undo operations', async () => {
    const s = await setup();
    let writes = 0;
    s.DA_CLOUD = { markDirty() {
            writes++;
        } };
    const before = plain([s.DA_STATE.undoStack, s.DA_STATE.redoStack, s.DA_STATE.cloudDirty]);
    s.DA_I18N.setPreference('zh-CN');
    s.DA_I18N.setPreference('system');
    assert.equal(writes, 0);
    assert.deepEqual(plain([s.DA_STATE.undoStack, s.DA_STATE.redoStack, s.DA_STATE.cloudDirty]), before);
});
