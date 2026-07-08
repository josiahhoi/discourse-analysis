/**
 * Tests for the EDITABLE parallel column (Alternate Views): a second text
 * column stored per-row in DA_STATE.parallelTexts, aligned to propositions[].
 * Covers the one-time verse→row materialization (distributeVersesToRows),
 * the owner-specified split/merge semantics (flow into an empty same-family
 * cell, else insert a row whose other column is empty; Backspace mirrors),
 * per-column format tags (pcol), undo/redo, and persistence (saved into
 * projects, aligned on import, old files load with the column off).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setupRenderer() {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/render-model.js');
  return sb;
}

function setupEditor() {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/render-model.js'); // distributeVersesToRows helpers
  load(sb, 'js/utils/editor-logic.js');
  return sb;
}

/** Two-verse doc with the column on: E1/E2 primary, C1/C2 parallel. */
function seed(sb, opts = {}) {
  sb.DA_STATE.propositions = opts.propositions || ['English one two', 'English three'];
  sb.DA_STATE.verseRefs = opts.verseRefs || ['1', '2'];
  sb.DA_STATE.verseBreaks = sb.DA_STATE.propositions.map(() => []);
  sb.DA_STATE.indentation = sb.DA_STATE.propositions.map(() => 0);
  sb.DA_STATE.parallelTexts = opts.parallelTexts || ['中文甲乙', '中文丙丁'];
  sb.DA_STATE.parallelLabel = 'CUV';
}

// ── distributeVersesToRows (materialization at fetch time) ──────────────────

test('distributeVersesToRows: one row per verse', () => {
  const sb = setupRenderer();
  sb.DA_STATE.verseRefs = ['1', '2', '3'];
  assert.deepEqual(
    sb.DA_RENDERER.distributeVersesToRows({ 1: 'one', 2: 'two', 3: 'three' }),
    ['one', 'two', 'three']
  );
});

test('distributeVersesToRows: split rows put the verse text on its first row only', () => {
  const sb = setupRenderer();
  sb.DA_STATE.verseRefs = ['1', '2', '2', '3'];
  assert.deepEqual(
    sb.DA_RENDERER.distributeVersesToRows({ 1: 'one', 2: 'two', 3: 'three' }),
    ['one', 'two', '', 'three']
  );
});

test('distributeVersesToRows: a merged range row joins its verses; misses give empty cells', () => {
  const sb = setupRenderer();
  sb.DA_STATE.verseRefs = ['2', '3-5', 'x'];
  assert.deepEqual(
    sb.DA_RENDERER.distributeVersesToRows({ 2: 'two', 3: 'three', 4: 'four', 5: 'five' }),
    ['two', 'three four five', '']
  );
});

// ── Parallel split: insert case ──────────────────────────────────────────────

test('parallel split inserts a row: empty primary, duplicated ref, cell text split', () => {
  const sb = setupEditor();
  seed(sb);
  sb.DA_EDITOR.splitParallelAtOffset(0, 2); // 中文 | 甲乙

  assert.deepEqual(sb.DA_STATE.propositions, ['English one two', '', 'English three']);
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['中文', '甲乙', '中文丙丁']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '1', '2'], 'ref duplicated → displays 1a/1b');
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[], [], []]);
  assert.deepEqual(sb.DA_STATE.indentation, [0, 0, 0]);
});

test('parallel split shifts row-indexed references below it, without an auto-bracket', () => {
  const sb = setupEditor();
  seed(sb);
  sb.DA_STATE.brackets = [{ id: 'brA', from: 'p0', to: 'p1', type: 'ground' }];
  sb.DA_STATE.wordArrows = [{ fromProp: 1, fromStart: 0, fromEnd: 7, toProp: 0, toStart: 0, toEnd: 7 }];
  sb.DA_STATE.comments = [{ type: 'text', target: { propIndex: 1, start: 0, end: 7 } }];
  sb.DA_STATE.formatTags = [{ type: 'bold', propIndex: 1, start: 0, end: 7 }];

  sb.DA_EDITOR.splitParallelAtOffset(0, 2);

  assert.deepEqual(sb.DA_STATE.brackets, [{ id: 'brA', from: 'p0', to: 'p2', type: 'ground' }], 'pN ref shifted, no auto-bracket added');
  assert.equal(sb.DA_STATE.wordArrows[0].fromProp, 2);
  assert.equal(sb.DA_STATE.comments[0].target.propIndex, 2);
  assert.equal(sb.DA_STATE.formatTags[0].propIndex, 2);
});

test('parallel split redistributes ONLY pcol tags across the cell halves', () => {
  const sb = setupEditor();
  seed(sb);
  sb.DA_STATE.formatTags = [
    { type: 'bold', propIndex: 0, start: 0, end: 15 },                       // primary: stays whole
    { type: 'color', color: '#E53935', propIndex: 0, start: 0, end: 4, pcol: true }, // spans the cell split
  ];
  sb.DA_EDITOR.splitParallelAtOffset(0, 2);

  const primary = sb.DA_STATE.formatTags.filter(f => !f.pcol);
  assert.deepEqual(primary, [{ type: 'bold', propIndex: 0, start: 0, end: 15 }]);
  const cellTags = sb.DA_STATE.formatTags.filter(f => f.pcol).sort((a, b) => a.propIndex - b.propIndex);
  assert.deepEqual(cellTags.map(({ type, color, propIndex, start, end }) => ({ type, color, propIndex, start, end })), [
    { type: 'color', color: '#E53935', propIndex: 0, start: 0, end: 2 },
    { type: 'color', color: '#E53935', propIndex: 1, start: 0, end: 2 },
  ], 'spanning cell tag split in two, color preserved');
});

// ── Flow-splits (the owner's 1a/1b/1c scenario) ─────────────────────────────

test("Andley's scenario: English split → Chinese flows into 1b → second Chinese split makes 1c", () => {
  const sb = setupEditor();
  seed(sb, { propositions: ['In the beginning God created', 'Verse two'], verseRefs: ['1', '2'], parallelTexts: ['起初神創造天地', '第二節'] });

  // 1. Split English v1 → 1a/1b; Chinese all stays in 1a.
  sb.DA_EDITOR.splitPropositionAtOffset(0, 'In the beginning'.length);
  assert.deepEqual(sb.DA_STATE.propositions, ['In the beginning', 'God created', 'Verse two']);
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['起初神創造天地', '', '第二節']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '1', '2']);

  // 2. Split Chinese in 1a → flows into 1b's empty cell (no new row).
  sb.DA_EDITOR.splitParallelAtOffset(0, 2);
  assert.deepEqual(sb.DA_STATE.propositions, ['In the beginning', 'God created', 'Verse two'], 'row count unchanged');
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['起初', '神創造天地', '第二節']);

  // 3. Split Chinese again in 1b → next row is verse 2 → INSERT 1c with empty English.
  sb.DA_EDITOR.splitParallelAtOffset(1, 3);
  assert.deepEqual(sb.DA_STATE.propositions, ['In the beginning', 'God created', '', 'Verse two']);
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['起初', '神創造', '天地', '第二節']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '1', '1', '2']);

  // 4. "...until we split again": English split in 1b flows into 1c's empty English.
  sb.DA_EDITOR.splitPropositionAtOffset(1, 'God'.length);
  assert.deepEqual(sb.DA_STATE.propositions, ['In the beginning', 'God', 'created', 'Verse two'], 'flowed, no new row');
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['起初', '神創造', '天地', '第二節'], 'Chinese untouched');
});

test('primary flow-split moves second-half primary anchors into the existing row', () => {
  const sb = setupEditor();
  seed(sb, { propositions: ['alpha beta', '', 'x'], verseRefs: ['1', '1', '2'], parallelTexts: ['甲', '乙', '丙'] });
  sb.DA_STATE.indentation = [0, 0, 0];
  sb.DA_STATE.verseBreaks = [[], [], []];
  sb.DA_STATE.formatTags = [{ type: 'bold', propIndex: 0, start: 6, end: 10 }]; // "beta"
  sb.DA_STATE.brackets = [{ id: 'brA', from: 'p0', to: 'p2', type: 'ground' }];

  sb.DA_EDITOR.splitPropositionAtOffset(0, 6);
  assert.deepEqual(sb.DA_STATE.propositions, ['alpha', 'beta', 'x']);
  assert.deepEqual(sb.DA_STATE.formatTags, [{ type: 'bold', propIndex: 1, start: 0, end: 4 }]);
  assert.deepEqual(sb.DA_STATE.brackets, [{ id: 'brA', from: 'p0', to: 'p2', type: 'ground' }], 'no index shift on flow');
});

test('primary split with no parallel column behaves exactly as before (insert, auto-bracket)', () => {
  const sb = setupEditor();
  sb.DA_STATE.propositions = ['alpha beta', 'gamma'];
  sb.DA_STATE.verseRefs = ['1', '2'];
  sb.DA_STATE.verseBreaks = [[], []];
  sb.DA_STATE.indentation = [0, 0];
  sb.DA_STATE.brackets = [{ id: 'brA', from: 'p0', to: 'p1', type: 'ground' }];

  sb.DA_EDITOR.splitPropositionAtOffset(0, 6);
  assert.deepEqual(sb.DA_STATE.propositions, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '1', '2']);
  assert.equal(sb.DA_STATE.brackets.length, 2, 'auto-bracket created for the referencing bracket');
  assert.equal(sb.DA_STATE.parallelTexts.some(t => t), false, 'no parallel content appears from nowhere');
});

// ── Merges (mirror of split) ────────────────────────────────────────────────

test('cell merge (row stays): Chinese joins upward, English rows untouched', () => {
  const sb = setupEditor();
  seed(sb, { propositions: ['English A', 'English B'], verseRefs: ['1', '1'], parallelTexts: ['中文一', '中文二'] });
  sb.DA_STATE.formatTags = [{ type: 'bold', propIndex: 1, start: 0, end: 3, pcol: true }];

  const res = sb.DA_EDITOR.mergeCellIntoPrevious('parallel', 1);
  assert.equal(res.removed, false);
  assert.deepEqual(sb.DA_STATE.propositions, ['English A', 'English B'], 'rows stay — English B still has content');
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['中文一 中文二', '']);
  assert.deepEqual(sb.DA_STATE.formatTags, [{ type: 'bold', propIndex: 0, start: 4, end: 7, pcol: true }]);
  assert.equal(res.seam, 4);
});

test('cell merge removes the row when it ends up empty on both sides (undoes a parallel insert-split)', () => {
  const sb = setupEditor();
  seed(sb, { propositions: ['English A', '', 'English C'], verseRefs: ['1', '1', '2'], parallelTexts: ['中文一', '中文二', '中文三'] });
  sb.DA_STATE.verseBreaks = [[], [], []];
  sb.DA_STATE.indentation = [0, 0, 0];

  const res = sb.DA_EDITOR.mergeCellIntoPrevious('parallel', 1);
  assert.equal(res.removed, true);
  assert.deepEqual(sb.DA_STATE.propositions, ['English A', 'English C'], 'empty-primary row removed');
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['中文一 中文二', '中文三']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '2']);
});

test('primary merge with no parallel column is the historical row merge', () => {
  const sb = setupEditor();
  sb.DA_STATE.propositions = ['alpha', 'beta'];
  sb.DA_STATE.verseRefs = ['1', '2'];
  sb.DA_STATE.verseBreaks = [[], []];
  sb.DA_STATE.indentation = [0, 0];
  sb.DA_STATE.parallelTexts = ['', ''];

  const res = sb.DA_EDITOR.mergeCellIntoPrevious('primary', 1);
  assert.equal(res.removed, true, 'other column empty → row merge');
  assert.deepEqual(sb.DA_STATE.propositions, ['alpha beta']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1-2']);
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[6]], 'verse transition recorded at the seam');
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['']);
});

test('primary cell merge (row stays): English joins upward, Chinese cells untouched', () => {
  const sb = setupEditor();
  seed(sb, { propositions: ['English A', 'English B'], verseRefs: ['1', '1'], parallelTexts: ['中文一', '中文二'] });
  const res = sb.DA_EDITOR.mergeCellIntoPrevious('primary', 1);
  assert.equal(res.removed, false, 'Chinese cell non-empty → row must stay');
  assert.deepEqual(sb.DA_STATE.propositions, ['English A English B', '']);
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['中文一', '中文二']);
});

// ── Undo / redo ─────────────────────────────────────────────────────────────

test('undo/redo round-trips a parallel split (parallelTexts and label are snapshotted)', () => {
  const sb = setupEditor();
  seed(sb);
  const before = {
    propositions: sb.DA_STATE.propositions.slice(),
    parallelTexts: sb.DA_STATE.parallelTexts.slice(),
    verseRefs: sb.DA_STATE.verseRefs.slice(),
  };

  sb.DA_STATE.lastUndoTime = 0; // defeat the debounce window for the test
  sb.DA_EDITOR.splitParallelAtOffset(0, 2);
  const after = {
    propositions: sb.DA_STATE.propositions.slice(),
    parallelTexts: sb.DA_STATE.parallelTexts.slice(),
    verseRefs: sb.DA_STATE.verseRefs.slice(),
  };

  sb.DA_STATE.undo();
  assert.deepEqual(sb.DA_STATE.propositions, before.propositions);
  assert.deepEqual(sb.DA_STATE.parallelTexts, before.parallelTexts);
  assert.deepEqual(sb.DA_STATE.verseRefs, before.verseRefs);
  assert.equal(sb.DA_STATE.parallelLabel, 'CUV');

  sb.DA_STATE.redo();
  assert.deepEqual(sb.DA_STATE.propositions, after.propositions);
  assert.deepEqual(sb.DA_STATE.parallelTexts, after.parallelTexts);
  assert.deepEqual(sb.DA_STATE.verseRefs, after.verseRefs);
});

// ── Persistence ─────────────────────────────────────────────────────────────

test('buildBracketData serializes the column; import restores it (round-trip)', () => {
  const sb = setupEditor();
  load(sb, 'js/services/export-service.js');
  load(sb, 'js/services/persistence.js');
  sb.DA_UI = { showStatus: () => {}, clearPropositionHighlights: () => {} };
  sb.renderAll = () => {}; // renderAll pulls render-arrows.js, not loaded here
  seed(sb);

  const data = JSON.parse(JSON.stringify(sb.DA_EXPORT.buildBracketData()));
  assert.deepEqual(data.parallelTexts, ['中文甲乙', '中文丙丁']);
  assert.equal(data.parallelLabel, 'CUV');

  assert.equal(data.parallelHidden, false);

  // Wipe and re-import.
  sb.DA_STATE.resetForNewDocument({});
  sb.DA_PERSISTENCE.importBracket(data);
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['中文甲乙', '中文丙丁']);
  assert.equal(sb.DA_STATE.parallelLabel, 'CUV');
  assert.equal(sb.DA_STATE.parallelHidden, false);

  // A hidden column round-trips hidden — with its data intact.
  data.parallelHidden = true;
  sb.DA_PERSISTENCE.importBracket(data);
  assert.equal(sb.DA_STATE.parallelHidden, true);
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['中文甲乙', '中文丙丁']);
});

test('old files (no parallel fields) load with the column off; misaligned arrays are guarded', () => {
  const sb = setupEditor();
  load(sb, 'js/services/persistence.js');
  sb.DA_UI = { showStatus: () => {}, clearPropositionHighlights: () => {} };
  sb.renderAll = () => {}; // renderAll pulls render-arrows.js, not loaded here

  sb.DA_PERSISTENCE.importBracket({ passageRef: 'John 1:1', propositions: ['a', 'b'], verseRefs: ['1', '2'] });
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['', '']);
  assert.equal(sb.DA_STATE.parallelLabel, '');

  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['a', 'b', 'c'],
    verseRefs: ['1', '2', '3'],
    parallelTexts: ['only-one', 42],
    parallelLabel: 'CUV',
  });
  assert.deepEqual(out.parallelTexts, ['only-one', '', ''], 'padded to length, non-strings dropped');
  assert.equal(out.parallelLabel, 'CUV');
  assert.equal(out.parallelHidden, false, 'missing hidden flag coerces to false');
});
