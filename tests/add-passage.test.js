/**
 * Tests for DA_EDITOR.addPassage and its helpers — extending a document with
 * whole verses at either edge. The core invariant: appending never moves any
 * existing anchor, and prepending shifts every positional anchor (pN bracket
 * refs, formatTag/arrow/comment indices) by exactly the number of rows added,
 * with all five row-parallel arrays staying aligned.
 */
const { test } = require('node:test');
// Non-strict assert: see editor-logic.test.js — sandbox values live in another
// realm, so deepStrictEqual's prototype check would spuriously fail.
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup(stateOverrides = {}) {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js'); // BOLLS_BOOKS for book-alias comparison
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/editor-logic.js');
  Object.assign(sb.DA_STATE, stateOverrides);
  return sb;
}

/** A small fully-decorated document: nested brackets, a tag, an arrow, a text
 *  comment, a bracket comment, and a highlight. */
function fixture() {
  return setup({
    passageRef: 'Galatians 3:20-22',
    propositions: ['a', 'b', 'c'],
    verseRefs: ['20', '21', '22'],
    verseBreaks: [[], [], []],
    parallelTexts: ['', '', ''],
    indentation: [0, 0, 0],
    brackets: [
      { id: 'brA', from: 'p0', to: 'p1', type: 'series' },
      { id: 'brB', from: 'brA', to: 'p2', type: 'ground' },
    ],
    formatTags: [{ type: 'bold', propIndex: 2, start: 0, end: 1 }],
    wordArrows: [{ fromProp: 2, fromStart: 0, fromEnd: 1, toProp: 0, toStart: 0, toEnd: 1 }],
    // replies: [] up front — the undo snapshot normalizes absent replies to
    // an empty array, and the round-trip test compares deep-equal.
    comments: [
      { type: 'text', target: { propIndex: 2 }, text: 'on c', replies: [] },
      { type: 'bracket', target: { bracketId: 'brB' }, text: 'on brB', replies: [] },
    ],
    bracketHighlights: { brA: '#ffe' },
  });
}

test('append: existing anchors are untouched, arrays extend in lockstep', () => {
  const sb = fixture();
  const before = JSON.parse(JSON.stringify({
    brackets: sb.DA_STATE.brackets,
    formatTags: sb.DA_STATE.formatTags,
    wordArrows: sb.DA_STATE.wordArrows,
    comments: sb.DA_STATE.comments,
    bracketHighlights: sb.DA_STATE.bracketHighlights,
  }));

  const { added, warning } = sb.DA_EDITOR.addPassage(
    { propositions: ['x', 'y'], verseRefs: ['23', '24'], passageRef: 'Galatians 3:23-24' }, 'end');

  assert.equal(added, 2);
  assert.equal(warning, null);
  assert.deepEqual(sb.DA_STATE.propositions, ['a', 'b', 'c', 'x', 'y']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['20', '21', '22', '23', '24']);
  assert.deepEqual(sb.DA_STATE.verseBreaks, [[], [], [], [], []]);
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['', '', '', '', '']);
  assert.deepEqual(sb.DA_STATE.indentation, [0, 0, 0, 0, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE.brackets)), before.brackets);
  assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE.formatTags)), before.formatTags);
  assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE.wordArrows)), before.wordArrows);
  assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE.comments)), before.comments);
  assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE.bracketHighlights)), before.bracketHighlights);
  assert.equal(sb.DA_STATE.passageRef, 'Galatians 3:20-24');
});

test('prepend: every positional anchor shifts by k, ids and highlights stay', () => {
  const sb = fixture();
  sb.DA_STATE.firstBracketPoint = 'p1';
  sb.DA_STATE.bracketSelectStep = 1;

  const { added, warning } = sb.DA_EDITOR.addPassage(
    { propositions: ['x', 'y'], verseRefs: ['18', '19'], passageRef: 'Galatians 3:18-19' }, 'start');

  assert.equal(added, 2);
  assert.equal(warning, null);
  assert.deepEqual(sb.DA_STATE.propositions, ['x', 'y', 'a', 'b', 'c']);
  assert.deepEqual(sb.DA_STATE.verseRefs, ['18', '19', '20', '21', '22']);
  // pN refs shifted by 2; bracket→bracket ref (stable id) untouched
  assert.deepEqual(
    sb.DA_STATE.brackets.map((b) => ({ from: b.from, to: b.to })),
    [{ from: 'p2', to: 'p3' }, { from: 'brA', to: 'p4' }]
  );
  assert.equal(sb.DA_STATE.formatTags[0].propIndex, 4);
  assert.equal(sb.DA_STATE.wordArrows[0].fromProp, 4);
  assert.equal(sb.DA_STATE.wordArrows[0].toProp, 2);
  assert.equal(sb.DA_STATE.comments[0].target.propIndex, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE.comments[1])),
    { type: 'bracket', target: { bracketId: 'brB' }, text: 'on brB', replies: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE.bracketHighlights)), { brA: '#ffe' });
  // in-progress bracket selection may hold a stale pN — reset
  assert.equal(sb.DA_STATE.firstBracketPoint, null);
  assert.equal(sb.DA_STATE.bracketSelectStep, 0);
  assert.equal(sb.DA_STATE.passageRef, 'Galatians 3:18-22');
});

test('short parallelTexts/indentation are padded at the OLD rows before inserting', () => {
  // parallelTexts had one entry for three props — after a prepend, that entry
  // must still belong to the original first row (now at index 2), never to a
  // new row.
  const sb = setup({
    passageRef: 'Galatians 3:20-22',
    propositions: ['a', 'b', 'c'],
    verseRefs: ['20', '21', '22'],
    verseBreaks: [[], [], []],
    parallelTexts: ['P'],
    indentation: [0],
  });
  sb.DA_EDITOR.addPassage({ propositions: ['x', 'y'], verseRefs: ['18', '19'] }, 'start');
  assert.deepEqual(sb.DA_STATE.parallelTexts, ['', '', 'P', '', '']);
  assert.equal(sb.DA_STATE.indentation.length, 5);

  const sb2 = setup({
    passageRef: 'Galatians 3:20-22',
    propositions: ['a', 'b', 'c'],
    verseRefs: ['20', '21', '22'],
    verseBreaks: [[], [], []],
    parallelTexts: ['P'],
    indentation: [0],
  });
  sb2.DA_EDITOR.addPassage({ propositions: ['x'], verseRefs: ['23'] }, 'end');
  assert.deepEqual(sb2.DA_STATE.parallelTexts, ['P', '', '', '']);
});

test('prepend: qualifyExistingWithChapter rewrites bare refs, keeps qualified ones', () => {
  const sb = setup({
    passageRef: 'Galatians 4:1-3',
    propositions: ['a', 'b'],
    verseRefs: ['1', '2-3'],
    verseBreaks: [[], []],
    parallelTexts: ['', ''],
    indentation: [0, 0],
  });
  const { warning } = sb.DA_EDITOR.addPassage({
    propositions: ['x', 'y'],
    verseRefs: ['28', '29'],
    passageRef: 'Galatians 3:28-29',
    qualifyExistingWithChapter: 4,
    docRefCtx: sb.DA_EDITOR.parseRefRange('Galatians 4:1-3'),
    addRefCtx: sb.DA_EDITOR.parseRefRange('Galatians 3:28-29'),
  }, 'start');
  assert.deepEqual(sb.DA_STATE.verseRefs, ['28', '29', '4:1', '4:2-3']);
  assert.equal(sb.DA_STATE.passageRef, 'Galatians 3:28-4:3');
  assert.equal(warning, null, 'chapter rollover onto 4:1 is a clean seam');
});

test('undo/redo round-trips an add, including passageRef', () => {
  const sb = fixture();
  const before = JSON.parse(JSON.stringify({
    passageRef: sb.DA_STATE.passageRef,
    propositions: sb.DA_STATE.propositions,
    verseRefs: sb.DA_STATE.verseRefs,
    brackets: sb.DA_STATE.brackets,
    formatTags: sb.DA_STATE.formatTags,
    wordArrows: sb.DA_STATE.wordArrows,
    comments: sb.DA_STATE.comments,
    parallelTexts: sb.DA_STATE.parallelTexts,
    indentation: sb.DA_STATE.indentation,
  }));

  for (const position of ['end', 'start']) {
    const data = position === 'end'
      ? { propositions: ['x'], verseRefs: ['23'], passageRef: 'Galatians 3:23' }
      : { propositions: ['x'], verseRefs: ['19'], passageRef: 'Galatians 3:19' };
    sb.DA_EDITOR.addPassage(data, position);
    const extendedRef = sb.DA_STATE.passageRef;

    sb.DA_STATE.undo();
    for (const key of Object.keys(before)) {
      assert.deepEqual(JSON.parse(JSON.stringify(sb.DA_STATE[key])), before[key],
        `${position}: undo restores ${key}`);
    }

    sb.DA_STATE.redo();
    assert.equal(sb.DA_STATE.propositions.length, 4, `${position}: redo re-adds the row`);
    assert.equal(sb.DA_STATE.passageRef, extendedRef, `${position}: redo re-extends the label`);
    sb.DA_STATE.undo(); // back to baseline for the next direction
  }
});

test('guards: empty input and empty document both throw', () => {
  const sb = fixture();
  assert.throws(() => sb.DA_EDITOR.addPassage({ propositions: [] }, 'end'), /Nothing to add/);
  const empty = setup();
  assert.throws(() => empty.DA_EDITOR.addPassage({ propositions: ['x'] }, 'end'), /No document/);
});

// ── extendPassageRef ─────────────────────────────────────────────────────────

test('extendPassageRef covers same-chapter, cross-chapter, and label edge cases', () => {
  const sb = setup();
  const ext = sb.DA_EDITOR.extendPassageRef;
  assert.equal(ext('Galatians 3:15-22', 'Galatians 3:23-25', ['23', '24', '25'], 'end'),
    'Galatians 3:15-25');
  // en-dash input normalizes to an ASCII hyphen
  assert.equal(ext('Galatians 3:15–22', 'Galatians 3:23-25', ['23', '24', '25'], 'end'),
    'Galatians 3:15-25');
  assert.equal(ext('Galatians 3:15-22', 'Galatians 4:1-7', ['4:1', '4:7'], 'end'),
    'Galatians 3:15-4:7');
  assert.equal(ext('Galatians 3:15-22', 'Galatians 3:10-14', ['10', '11', '12', '13', '14'], 'start'),
    'Galatians 3:10-22');
  assert.equal(ext('Galatians 4:1-7', 'Galatians 3:26-29', ['26', '27', '28', '29'], 'start'),
    'Galatians 3:26-4:7');
  // book aliases resolve through BOLLS_BOOKS ("Gal" == "Galatians")
  assert.equal(ext('Gal 3:15-22', 'Galatians 3:23-25', ['23', '24', '25'], 'end'),
    'Gal 3:15-25');
  // single-verse current label grows into a range
  assert.equal(ext('Galatians 3:15', 'Galatians 3:16-17', ['16', '17'], 'end'),
    'Galatians 3:15-17');
  // different book → compound label the user can hand-edit
  assert.equal(ext('Galatians 3:15-22', 'Romans 8:1-4', ['1', '2', '3', '4'], 'end'),
    'Galatians 3:15-22 + Romans 8:1-4');
  assert.equal(ext('Galatians 3:15-22', 'Romans 8:1-4', ['1', '2', '3', '4'], 'start'),
    'Romans 8:1-4 + Galatians 3:15-22');
  // whole-chapter and unparseable labels
  assert.equal(ext('Galatians 3', 'Galatians 4:1-7', ['4:1', '4:7'], 'end'), 'Galatians 3');
  assert.equal(ext('Imported text', 'Galatians 3:23-25', ['23'], 'end'),
    'Imported text + Galatians 3:23-25');
});

// ── detectAddPosition ────────────────────────────────────────────────────────

test('detectAddPosition routes by verse range, defaulting to the end', () => {
  const sb = setup();
  const det = sb.DA_EDITOR.detectAddPosition;
  const range = sb.DA_EDITOR.parseRefRange;
  const doc = range('Galatians 3:15-22');
  const refs = ['15', '16', '17', '18', '19', '20', '21', '22'];

  assert.equal(det(doc, refs, range('Galatians 3:23-25'), ['23', '24', '25']), 'end');
  assert.equal(det(doc, refs, range('Galatians 3:10-14'), ['10', '11', '12', '13', '14']), 'start');
  // overlap / contained → end (safe, remap-free, undoable)
  assert.equal(det(doc, refs, range('Galatians 3:20-25'), ['20', '21', '22', '23', '24', '25']), 'end');
  // different book → end
  assert.equal(det(doc, refs, range('Romans 8:1-4'), ['1', '2', '3', '4']), 'end');
  // unparseable incoming refs → end
  assert.equal(det(doc, refs, null, []), 'end');
  // cross-chapter both directions
  assert.equal(det(range('Galatians 4:1-7'), ['1', '2', '3', '4', '5', '6', '7'],
    range('Galatians 3:26-29'), ['26', '27', '28', '29']), 'start');
  assert.equal(det(doc, refs, range('Galatians 4:1-4'), ['1', '2', '3', '4']), 'end');
});

// ── checkContiguity ──────────────────────────────────────────────────────────

test('checkContiguity notes gaps and overlaps, stays quiet on clean seams', () => {
  const sb = setup();
  const chk = sb.DA_EDITOR.checkContiguity;
  assert.equal(chk(['20', '21', '22'], ['23'], 'end'), null);
  assert.equal(chk(['20-22'], ['23'], 'end'), null);
  assert.match(chk(['20', '21', '22'], ['25'], 'end'), /gap/i);
  assert.match(chk(['20', '21', '22'], ['22'], 'end'), /overlap/i);
  // chapter rollover onto verse 1 of the next chapter is clean (ctx supplies
  // the chapter the bare existing refs belong to)
  assert.equal(chk(['28', '29'], ['4:1', '4:2'], 'end', { chapter: 3 }, { chapter: 4 }), null);
  // prepend seams
  assert.equal(chk(['15', '16'], ['13', '14'], 'start'), null);
  assert.match(chk(['15', '16'], ['10', '11'], 'start'), /gap/i);
  // unparseable → silent
  assert.equal(chk([], ['23'], 'end'), null);
});
