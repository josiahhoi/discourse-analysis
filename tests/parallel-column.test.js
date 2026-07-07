/**
 * Tests for the parallel column (Alternate Views): a second translation shown
 * view-only beside the text, keyed by VERSE number. Covers the verse→row cell
 * mapping (computeParallelCells), the transient-state contract (never
 * undo-snapshotted, never serialized into saves), and the clear-on-replace
 * behavior when a new project is imported.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

// ── computeParallelCells (rendering-engine.js) ───────────────────────────────

function setupRenderer() {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/rendering-engine.js');
  return sb;
}

test('computeParallelCells returns null when the column is off', () => {
  const sb = setupRenderer();
  sb.DA_STATE.verseRefs = ['1', '2'];
  assert.equal(sb.DA_RENDERER.computeParallelCells(), null, 'off by default');

  sb.DA_STATE.parallelVerses = { 1: 'text' };
  assert.equal(sb.DA_RENDERER.computeParallelCells(), null, 'verses without a label = off');

  sb.DA_STATE.parallelVerses = {};
  sb.DA_STATE.parallelLabel = 'CUV';
  assert.equal(sb.DA_RENDERER.computeParallelCells(), null, 'label without verses = off');
});

test('one row per verse: each row gets its own verse text', () => {
  const sb = setupRenderer();
  sb.DA_STATE.verseRefs = ['1', '2', '3'];
  sb.DA_STATE.parallelLabel = 'CUV';
  sb.DA_STATE.parallelVerses = { 1: 'one', 2: 'two', 3: 'three' };
  assert.deepEqual(sb.DA_RENDERER.computeParallelCells(), ['one', 'two', 'three']);
});

test('split rows (3a/3b appear as repeated refs): text lands on the first row only', () => {
  const sb = setupRenderer();
  // After splitting verse 2 into two propositions, both rows carry ref '2'.
  sb.DA_STATE.verseRefs = ['1', '2', '2', '3'];
  sb.DA_STATE.parallelLabel = 'CUV';
  sb.DA_STATE.parallelVerses = { 1: 'one', 2: 'two', 3: 'three' };
  assert.deepEqual(sb.DA_RENDERER.computeParallelCells(), ['one', 'two', '', 'three']);
});

test('a merged range row (3-5) joins the covered verses', () => {
  const sb = setupRenderer();
  sb.DA_STATE.verseRefs = ['2', '3-5', '6'];
  sb.DA_STATE.parallelLabel = 'CUV';
  sb.DA_STATE.parallelVerses = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
  assert.deepEqual(sb.DA_RENDERER.computeParallelCells(), ['two', 'three four five', 'six']);
});

test('verses missing from the fetched chapter and non-numeric refs give empty cells', () => {
  const sb = setupRenderer();
  sb.DA_STATE.verseRefs = ['1', '3:14', '', '2'];
  sb.DA_STATE.parallelLabel = 'CUV';
  sb.DA_STATE.parallelVerses = { 2: 'two' }; // verse 1 not in the map
  assert.deepEqual(sb.DA_RENDERER.computeParallelCells(), ['', '', '', 'two']);
});

// ── Transient-state contract (state.js + export-service.js) ─────────────────

test('undo snapshots do not capture the parallel column (undo leaves it alone)', () => {
  const sb = setupRenderer();
  sb.DA_STATE.propositions = ['a'];
  sb.DA_STATE.verseRefs = ['1'];

  sb.DA_STATE.pushUndo('test-action');
  sb.DA_STATE.parallelVerses = { 1: 'one' };
  sb.DA_STATE.parallelLabel = 'CUV';

  const snap = sb.DA_STATE.undoStack[sb.DA_STATE.undoStack.length - 1];
  assert.ok(!('parallelVerses' in snap) && !('parallelLabel' in snap), 'snapshot omits parallel fields');

  sb.DA_STATE.undo();
  assert.deepEqual(sb.DA_STATE.parallelVerses, { 1: 'one' }, 'column survives undo');
  assert.equal(sb.DA_STATE.parallelLabel, 'CUV');
});

test('buildBracketData (saves/exports/cloud) never serializes parallel fields', () => {
  const sb = setupRenderer();
  load(sb, 'js/services/export-service.js');
  sb.DA_STATE.propositions = ['a'];
  sb.DA_STATE.verseRefs = ['1'];
  sb.DA_STATE.parallelVerses = { 1: 'one' };
  sb.DA_STATE.parallelLabel = 'CUV';

  const data = sb.DA_EXPORT.buildBracketData();
  assert.ok(!('parallelVerses' in data) && !('parallelLabel' in data));
  assert.ok(!JSON.stringify(data).includes('CUV'), 'label leaks nowhere in the JSON');
});

// ── Clear on content replacement (persistence.js importBracket) ─────────────

test('importing a project clears the parallel column', () => {
  const sb = createSandbox({
    DA_UI: { showStatus: () => {}, clearPropositionHighlights: () => {} },
  });
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/persistence.js');

  sb.DA_STATE.parallelVerses = { 1: 'one' };
  sb.DA_STATE.parallelLabel = 'CUV';

  sb.DA_PERSISTENCE.importBracket({
    passageRef: 'John 1:1',
    propositions: ['In the beginning was the Word'],
    verseRefs: ['1'],
  });

  assert.deepEqual(sb.DA_STATE.parallelVerses, {});
  assert.equal(sb.DA_STATE.parallelLabel, '');
});
