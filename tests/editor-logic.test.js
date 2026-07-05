/**
 * Tests for the proposition split/merge engine — the most intricate code in the
 * app. Splitting and merging must keep verse refs, indentation, brackets, word
 * arrows, comments, and format tags all pointing at the right text after the
 * underlying proposition array shifts.
 */
const { test } = require('node:test');
// Non-strict assert: values created inside the vm sandbox have a different
// realm's Array/Object prototype, which deepStrictEqual rejects. Structural
// (non-strict) deepEqual is the correct comparison across realms.
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

const ZW = '​'; // zero-width marker the app inserts at verse transitions

function setup(stateOverrides = {}) {
  const sb = createSandbox();
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/editor-logic.js');
  Object.assign(sb.DA_STATE, stateOverrides);
  return sb;
}

test('split: divides a proposition at the cursor offset', () => {
  const sb = setup({ propositions: ['hello world'], verseRefs: ['5'], indentation: [0] });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 5);
  assert.deepEqual(sb.DA_STATE.propositions, ['hello', 'world']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['5', '5']);
  assert.equal(sb.DA_STATE.indentation.length, 2);
});

test('split: trims whitespace at the boundary', () => {
  const sb = setup({ propositions: ['hello   world'], verseRefs: ['1'], indentation: [0] });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 6); // mid-whitespace
  assert.deepEqual(sb.DA_STATE.propositions, ['hello', 'world']);
});

test('split: no-op at the very start, very end, or whitespace-only tail', () => {
  for (const offset of [0, 11]) {
    const sb = setup({ propositions: ['hello world'], verseRefs: ['1'], indentation: [0] });
    sb.DA_EDITOR.splitPropositionAtOffset(0, offset);
    assert.deepEqual(sb.DA_STATE.propositions, ['hello world'], `offset ${offset}`);
  }
  const sb = setup({ propositions: ['hello   '], verseRefs: ['1'], indentation: [0] });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 5); // only whitespace after cursor
  assert.deepEqual(sb.DA_STATE.propositions, ['hello   ']);
});

test('split: at a verse-transition marker renumbers the two halves', () => {
  const sb = setup({ propositions: [`first${ZW}second`], verseRefs: ['1-2'], indentation: [0] });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 5); // cursor adjacent to the marker
  assert.deepEqual(sb.DA_STATE.propositions, ['first', 'second']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '2']);
});

test('split: shifts pN bracket refs after the split point', () => {
  const sb = setup({
    propositions: ['alpha', 'beta'],
    verseRefs: ['1', '2'],
    indentation: [0, 0],
    brackets: [{ from: 'p1', to: 'p1', type: 'series' }], // points at the later prop
  });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 2); // split prop 0 -> prop 1 becomes prop 2
  assert.equal(sb.DA_STATE.brackets[0].from, 'p2');
  assert.equal(sb.DA_STATE.brackets[0].to, 'p2');
});

test('split: splitting a bracketed proposition inserts a child bracket', () => {
  const sb = setup({
    propositions: ['alpha', 'beta'],
    verseRefs: ['1', '2'],
    indentation: [0, 0],
    brackets: [{ from: 'p0', to: 'p1', type: 'ground' }],
  });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 2);
  // The two halves of prop 0 get their own bracket, and the original bracket now
  // points at that new bracket (by its stable id) instead of the bare proposition.
  assert.equal(sb.DA_STATE.brackets.length, 2);
  assert.deepEqual(
    { from: sb.DA_STATE.brackets[1].from, to: sb.DA_STATE.brackets[1].to },
    { from: 'p0', to: 'p1' }
  );
  assert.ok(sb.DA_STATE.brackets[1].id, 'auto-created bracket has an id');
  assert.equal(sb.DA_STATE.brackets[0].from, sb.DA_STATE.brackets[1].id);
  assert.equal(sb.DA_STATE.brackets[0].to, 'p2');
});

test('split: relocates format tags that live in the second half', () => {
  const sb = setup({
    propositions: ['hello world'],
    verseRefs: ['1'],
    indentation: [0],
    formatTags: [{ type: 'bold', propIndex: 0, start: 6, end: 11 }], // "world"
  });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 5);
  const tag = sb.DA_STATE.formatTags[0];
  assert.equal(tag.propIndex, 1);
  assert.equal(tag.start, 0);
  assert.equal(tag.end, 5); // "world"
});

test('split: moves word arrows whose anchor falls in the second half', () => {
  const sb = setup({
    propositions: ['hello world'],
    verseRefs: ['1'],
    indentation: [0],
    wordArrows: [{ fromProp: 0, fromStart: 0, fromEnd: 5, toProp: 0, toStart: 6, toEnd: 11 }],
  });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 5);
  const wa = sb.DA_STATE.wordArrows[0];
  assert.equal(wa.fromProp, 0); // "hello" stays in first half
  assert.equal(wa.toProp, 1);   // "world" moved to second half
  assert.equal(wa.toStart, 0);
  assert.equal(wa.toEnd, 5);
});

test('merge: joins a proposition into the one above it', () => {
  const sb = setup({ propositions: ['hello', 'world'], verseRefs: ['5', '5'], indentation: [0, 0] });
  sb.DA_EDITOR.mergePropositions(1);
  assert.deepEqual(sb.DA_STATE.propositions, ['hello world']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['5']);
});

test('merge: across a verse boundary keeps a marker and a combined ref', () => {
  const sb = setup({ propositions: ['first', 'second'], verseRefs: ['1', '2'], indentation: [0, 0] });
  sb.DA_EDITOR.mergePropositions(1);
  assert.equal(sb.DA_STATE.propositions[0], `first${ZW}second`);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1-2']);
});

test('merge: no-op on the first proposition', () => {
  const sb = setup({ propositions: ['only'], verseRefs: ['1'], indentation: [0] });
  sb.DA_EDITOR.mergePropositions(0);
  assert.deepEqual(sb.DA_STATE.propositions, ['only']);
});

test('merge: offsets format tags from the merged-in proposition', () => {
  const sb = setup({
    propositions: ['ab', 'cd'],
    verseRefs: ['1', '1'],
    indentation: [0, 0],
    formatTags: [{ type: 'bold', propIndex: 1, start: 0, end: 2 }], // "cd"
  });
  sb.DA_EDITOR.mergePropositions(1);
  const tag = sb.DA_STATE.formatTags[0];
  assert.equal(tag.propIndex, 0);
  // merged string is "ab cd" -> "cd" is at [3,5)
  assert.equal(sb.DA_STATE.propositions[0].slice(tag.start, tag.end), 'cd');
});

test('merge: drops a degenerate bracket whose two ends collapse together', () => {
  const sb = setup({
    propositions: ['a', 'b'],
    verseRefs: ['1', '1'],
    indentation: [0, 0],
    brackets: [{ from: 'p0', to: 'p1', type: 'series' }],
  });
  sb.DA_EDITOR.mergePropositions(1); // p0 and p1 become the same prop
  assert.equal(sb.DA_STATE.brackets.length, 0);
});

test('changeIndentation: increments and clamps at zero', () => {
  const sb = setup({ propositions: ['x'], verseRefs: ['1'], indentation: [0] });
  sb.DA_EDITOR.changeIndentation(0, 2);
  assert.equal(sb.DA_STATE.indentation[0], 2);
  sb.DA_EDITOR.changeIndentation(0, -5);
  assert.equal(sb.DA_STATE.indentation[0], 0);
});

test('split + merge round-trips back to the original text', () => {
  const sb = setup({ propositions: ['the quick brown fox'], verseRefs: ['7'], indentation: [0] });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 9); // "the quick" | "brown fox"
  assert.equal(sb.DA_STATE.propositions.length, 2);
  sb.DA_EDITOR.mergePropositions(1);
  assert.deepEqual(sb.DA_STATE.propositions, ['the quick brown fox']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['7']);
});
