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

test('split: at a recorded verse boundary renumbers the two halves', () => {
  // "first second" merged from verses 1+2: verse 2 begins at offset 6.
  const sb = setup({ propositions: ['first second'], verseRefs: ['1-2'], verseBreaks: [[6]], indentation: [0] });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 5); // cursor within ±2 of the boundary → snaps
  assert.deepEqual(sb.DA_STATE.propositions, ['first', 'second']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '2']);
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[], []], 'boundary consumed by the split');
});

test('split: inside a verse of a merged range interpolates the refs', () => {
  // verses 1-2 merged; verse 2 begins at 13. Split far from the boundary.
  const sb = setup({ propositions: ['aaaa bbb cccc ddd eee'], verseRefs: ['1-2'], verseBreaks: [[14]], indentation: [0] });
  sb.DA_EDITOR.splitPropositionAtOffset(0, 5); // inside verse 1
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '1-2']);
  // the boundary moves to the second half, shifted into its coordinates
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[], [9]]);
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

test('merge: across a verse boundary joins with a space and records the boundary', () => {
  const sb = setup({ propositions: ['first', 'second'], verseRefs: ['1', '2'], verseBreaks: [[], []], indentation: [0, 0] });
  sb.DA_EDITOR.mergePropositions(1);
  assert.equal(sb.DA_STATE.propositions[0], 'first second', 'visible space, no invisible marker');
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1-2']);
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[6]], 'verse 2 begins at offset 6');
});

test('merge → split round-trips the verse boundary exactly', () => {
  const sb = setup({ propositions: ['first', 'second'], verseRefs: ['1', '2'], verseBreaks: [[], []], indentation: [0, 0] });
  sb.DA_EDITOR.mergePropositions(1);
  sb.DA_EDITOR.splitPropositionAtOffset(0, 6); // exactly at the recorded boundary
  assert.deepEqual(sb.DA_STATE.propositions, ['first', 'second']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1', '2']);
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[], []]);
});

test('merging three verses accumulates two boundaries; both survive a re-merge shift', () => {
  const sb = setup({ propositions: ['aa', 'bb', 'cc'], verseRefs: ['1', '2', '3'], verseBreaks: [[], [], []], indentation: [0, 0, 0] });
  sb.DA_EDITOR.mergePropositions(1); // 'aa bb' breaks [3]
  sb.DA_EDITOR.mergePropositions(1); // 'aa bb cc' breaks [3, 6]
  assert.equal(sb.DA_STATE.propositions[0], 'aa bb cc');
  assert.deepEqual(sb.DA_STATE.verseRefs, ['1-3']);
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[3, 6]]);
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

// ── deleteBracket: cascade to dependents ─────────────────────────────────────

function setupWithConfirm(stateOverrides, confirmAnswer) {
  const confirmCalls = [];
  const sb = createSandbox({
    confirm: (msg) => { confirmCalls.push(msg); return confirmAnswer; },
  });
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/editor-logic.js');
  Object.assign(sb.DA_STATE, stateOverrides);
  return { sb, confirmCalls };
}

const nestedState = () => ({
  propositions: ['v21', 'v22', 'v23'],
  verseRefs: ['21', '22', '23'],
  indentation: [0, 0, 0],
  brackets: [
    { id: 'brInner', from: 'p1', to: 'p2', type: 'action-manner' },
    { id: 'brOuter', from: 'p0', to: 'brInner', type: 'negative-positive' },
  ],
  comments: [
    { id: 'c1', type: 'bracket', target: { bracketId: 'brOuter' }, text: 'on outer', replies: [] },
  ],
  bracketHighlights: { brOuter: '#FFF9C4' },
});

test('deleteBracket: deleting a nested bracket cascades to the bracket built on it', () => {
  const { sb, confirmCalls } = setupWithConfirm(nestedState(), true);
  const removed = sb.DA_EDITOR.deleteBracket(0); // the inner bracket
  assert.equal(removed, 2, 'inner + dependent outer');
  assert.equal(sb.DA_STATE.brackets.length, 0, 'no orphaned/nonsense bracket remains');
  assert.equal(confirmCalls.length, 1, 'user was asked first');
  assert.match(confirmCalls[0], /1 larger bracket/);
  assert.equal(sb.DA_STATE.comments.length, 0, 'outer bracket comment removed too');
  assert.deepEqual(sb.DA_STATE.bracketHighlights, {}, 'outer highlight removed too');
});

test('deleteBracket: cancelling the confirm leaves everything untouched', () => {
  const { sb } = setupWithConfirm(nestedState(), false);
  const removed = sb.DA_EDITOR.deleteBracket(0);
  assert.equal(removed, 0);
  assert.equal(sb.DA_STATE.brackets.length, 2);
  assert.equal(sb.DA_STATE.undoStack.length, 0, 'no undo entry for a cancelled delete');
});

test('deleteBracket: a standalone bracket deletes silently (no confirm)', () => {
  const { sb, confirmCalls } = setupWithConfirm({
    propositions: ['a', 'b'],
    verseRefs: ['1', '2'],
    indentation: [0, 0],
    brackets: [{ id: 'brOnly', from: 'p0', to: 'p1', type: 'series' }],
  }, true);
  const removed = sb.DA_EDITOR.deleteBracket(0);
  assert.equal(removed, 1);
  assert.equal(confirmCalls.length, 0, 'no confirmation needed');
  assert.equal(sb.DA_STATE.brackets.length, 0);
});

test('deleteBracket: deleting the OUTER bracket leaves the inner one intact', () => {
  const { sb, confirmCalls } = setupWithConfirm(nestedState(), true);
  const removed = sb.DA_EDITOR.deleteBracket(1); // the outer bracket
  assert.equal(removed, 1);
  assert.equal(confirmCalls.length, 0, 'nothing is built on the outer bracket');
  assert.deepEqual(sb.DA_STATE.brackets.map(b => b.id), ['brInner']);
});

test('deleteBracket: undo restores the whole cascaded set', () => {
  const { sb } = setupWithConfirm(nestedState(), true);
  sb.DA_EDITOR.deleteBracket(0);
  const action = sb.DA_STATE.undo();
  assert.equal(action, 'delete brackets');
  assert.deepEqual(sb.DA_STATE.brackets.map(b => b.id), ['brInner', 'brOuter']);
  assert.equal(sb.DA_STATE.comments.length, 1);
});

// ── handleDotClick: from/to normalized to text order, not click order ────────

function setupForDotClick(stateOverrides = {}) {
  const sb = createSandbox({ DA_UI: { showStatus: () => {} } });
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/render-model.js'); // real getPointExtent/getBracketExtent
  load(sb, 'js/utils/editor-logic.js');
  // renderAll() pulls in render-arrows.js/render-comments.js (DOM-only, not
  // loaded here) via bare globals — stub it out, this test only cares about
  // the resulting bracket data, not the DOM render.
  sb.DA_RENDERER.renderAll = () => {};
  Object.assign(sb.DA_STATE, {
    propositions: ['first', 'second', 'third'],
    verseRefs: ['1', '2', '3'],
    indentation: [0, 0, 0],
    brackets: [],
    ...stateOverrides,
  });
  return sb;
}

test('handleDotClick: clicking the LATER line first still puts the earlier one on from/top', () => {
  const sb = setupForDotClick();
  sb.DA_EDITOR.handleDotClick('p1'); // click "second" first (later text)
  sb.DA_EDITOR.handleDotClick('p0'); // click "first" second (earlier text)
  assert.equal(sb.DA_STATE.brackets.length, 1);
  assert.equal(sb.DA_STATE.brackets[0].from, 'p0', 'earlier proposition is from/top');
  assert.equal(sb.DA_STATE.brackets[0].to, 'p1', 'later proposition is to/bottom');
});

test('handleDotClick: clicking in text order already gives the same result (no regression)', () => {
  const sb = setupForDotClick();
  sb.DA_EDITOR.handleDotClick('p0');
  sb.DA_EDITOR.handleDotClick('p1');
  assert.equal(sb.DA_STATE.brackets[0].from, 'p0');
  assert.equal(sb.DA_STATE.brackets[0].to, 'p1');
});

test('handleDotClick: reversed click order also normalizes when attaching to a nested bracket node', () => {
  // A bracket already spans p1-p2; connect p0 to that bracket's node, clicking
  // the NODE first and the earlier proposition second.
  const sb = setupForDotClick({
    brackets: [{ id: 'brInner', from: 'p1', to: 'p2', type: 'series' }],
  });
  sb.DA_EDITOR.handleDotClick('brInner'); // click the nested bracket's node first
  sb.DA_EDITOR.handleDotClick('p0');       // click the earlier line second
  const outer = sb.DA_STATE.brackets.find(b => b.id !== 'brInner');
  assert.equal(outer.from, 'p0', 'earlier proposition stays on from/top');
  assert.equal(outer.to, 'brInner', 'the later nested unit stays on to/bottom');
});
