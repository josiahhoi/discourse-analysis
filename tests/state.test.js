/**
 * Tests for the undo stack in state.js: snapshots must deep-copy the parts of
 * DA_STATE they capture (so later mutation doesn't corrupt the snapshot), and
 * undo must restore them — including customLabels, which was previously dropped.
 */
const { test } = require('node:test');
// Non-strict assert: see editor-logic.test.js — sandbox values live in another
// realm, so deepStrictEqual's prototype check would spuriously fail.
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup(stateOverrides = {}) {
  const sb = createSandbox();
  load(sb, 'js/services/state.js');
  Object.assign(sb.DA_STATE, stateOverrides);
  return sb;
}

test('undo restores propositions and returns the action name', () => {
  const sb = setup({ propositions: ['a'], verseRefs: ['1'] });
  sb.DA_STATE.pushUndo('edit');
  sb.DA_STATE.propositions = ['a', 'b'];
  const action = sb.DA_STATE.undo();
  assert.equal(action, 'edit');
  assert.deepEqual(sb.DA_STATE.propositions, ['a']);
});

test('undo on an empty stack returns null', () => {
  const sb = setup();
  assert.equal(sb.DA_STATE.undo(), null);
});

test('snapshot deep-copies brackets so later edits do not leak into history', () => {
  const sb = setup({ brackets: [{ from: 'p0', to: 'p1', type: 'series' }] });
  sb.DA_STATE.pushUndo('add bracket');
  sb.DA_STATE.brackets[0].type = 'ground'; // mutate AFTER the snapshot
  sb.DA_STATE.undo();
  assert.equal(sb.DA_STATE.brackets[0].type, 'series');
});

test('undo restores customLabels (regression: previously not snapshotted)', () => {
  const sb = setup({ customLabels: [{ id: 'cl_1', label: 'Orig' }] });
  sb.DA_STATE.pushUndo('add custom label');
  sb.DA_STATE.customLabels = [{ id: 'cl_1', label: 'Orig' }, { id: 'cl_2', label: 'New' }];
  sb.DA_STATE.undo();
  assert.deepEqual(sb.DA_STATE.customLabels.map((c) => c.label), ['Orig']);
});

test('pushUndo debounces identical action+key within the time window', () => {
  const sb = setup({ propositions: ['a'] });
  sb.DA_STATE.pushUndo('split', '0');
  sb.DA_STATE.pushUndo('split', '0'); // same key -> debounced
  assert.equal(sb.DA_STATE.undoStack.length, 1);
});

test('pushUndo keeps distinct snapshots for different actions or keys', () => {
  const sb = setup({ propositions: ['a'] });
  sb.DA_STATE.pushUndo('split', '0');
  sb.DA_STATE.pushUndo('split', '1'); // different key
  sb.DA_STATE.pushUndo('merge', '1'); // different action
  assert.equal(sb.DA_STATE.undoStack.length, 3);
});

test('undo stack is capped at 50 entries', () => {
  const sb = setup({ propositions: ['a'] });
  for (let i = 0; i < 60; i++) sb.DA_STATE.pushUndo('edit', String(i));
  assert.equal(sb.DA_STATE.undoStack.length, 50);
});
