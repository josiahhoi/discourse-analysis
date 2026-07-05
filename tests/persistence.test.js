/**
 * Tests for normalizeBracketData — the migration layer every imported/cloud
 * file passes through. It normalizes verse refs to bare numbers, upgrades
 * legacy numeric bracket endpoints, and converts all positional bracket
 * references ('bN' from/to, comment bracketIdx, highlight index keys) to
 * stable bracket ids.
 */
const { test } = require('node:test');
// Non-strict assert: see editor-logic.test.js — sandbox values live in another
// realm, so deepStrictEqual's prototype check would spuriously fail.
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup() {
  const sb = createSandbox();
  load(sb, 'js/services/state.js');
  load(sb, 'js/services/persistence.js');
  return sb;
}

test('strips display letters from verse refs (3a -> 3, 3a-4b -> 3-4)', () => {
  const sb = setup();
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['x', 'y'],
    verseRefs: ['3a', '3a-4b'],
  });
  assert.deepEqual(out.verseRefs, ['3', '3-4']);
});

test('collapses a same-number range (3-3 -> 3)', () => {
  const sb = setup();
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['x'],
    verseRefs: ['3-3'],
  });
  assert.deepEqual(out.verseRefs, ['3']);
});

test('keeps pN refs, assigns unique stable ids to modern brackets', () => {
  const sb = setup();
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['a', 'b'],
    verseRefs: ['1', '2'],
    brackets: [
      { from: 'p0', to: 'p1', type: 'series' },
      { from: 'p0', to: 'p1', type: 'ground' },
    ],
  });
  assert.deepEqual(
    out.brackets.map((b) => ({ from: b.from, to: b.to })),
    [{ from: 'p0', to: 'p1' }, { from: 'p0', to: 'p1' }]
  );
  assert.ok(out.brackets[0].id && out.brackets[1].id, 'both brackets got ids');
  assert.notEqual(out.brackets[0].id, out.brackets[1].id, 'ids are unique');
});

test('migrates legacy numeric brackets into nested pN/id refs', () => {
  const sb = setup();
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['a', 'b', 'c'],
    verseRefs: ['1', '2', '3'],
    brackets: [
      { from: 0, to: 2, type: 'ground' }, // outer
      { from: 0, to: 1, type: 'series' }, // inner
    ],
  });
  // Inner bracket is processed first (narrower); the outer then points at it
  // by stable id for its left end and the bare prop c for its right end.
  assert.deepEqual(
    { from: out.brackets[0].from, to: out.brackets[0].to },
    { from: 'p0', to: 'p1' }
  );
  assert.equal(out.brackets[1].from, out.brackets[0].id);
  assert.equal(out.brackets[1].to, 'p2');
  assert.equal(out.version, 2);
});

test('converts positional bN refs, comment bracketIdx, and highlight keys to ids', () => {
  const sb = setup();
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['a', 'b', 'c'],
    verseRefs: ['1', '2', '3'],
    brackets: [
      { id: '1700000000001', from: 'p0', to: 'p1', type: 'series' },
      { id: '1700000000001', from: 'b0', to: 'p2', type: 'ground' }, // duplicate id + index ref
    ],
    comments: [
      { id: 'c1', type: 'bracket', target: { bracketIdx: 1 }, text: 'outer note' },
      { id: 'c2', type: 'text', target: { propIndex: 0, start: 0, end: 1 }, text: 'word note' },
    ],
    bracketHighlights: { 0: '#FFF9C4' },
  });
  const [inner, outer] = out.brackets;
  assert.notEqual(inner.id, outer.id, 'duplicate ids are regenerated');
  assert.equal(outer.from, inner.id, 'bN index ref converted to the id');
  assert.equal(out.comments[0].target.bracketId, outer.id);
  assert.equal(out.comments[0].target.bracketIdx, undefined);
  assert.deepEqual(out.comments[1].target, { propIndex: 0, start: 0, end: 1 }, 'text comments untouched');
  assert.deepEqual(out.bracketHighlights, { [inner.id]: '#FFF9C4' });
});

test('accepts the legacy `arcs` key as a brackets source', () => {
  const sb = setup();
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['a', 'b'],
    verseRefs: ['1', '2'],
    arcs: [{ from: 0, to: 1, type: 'series' }],
  });
  assert.deepEqual(
    out.brackets.map((b) => ({ from: b.from, to: b.to })),
    [{ from: 'p0', to: 'p1' }]
  );
});

test('returns non-bracket data unchanged (no propositions array)', () => {
  const sb = setup();
  const input = { foo: 'bar' };
  assert.equal(sb.DA_PERSISTENCE.normalizeBracketData(input), input);
});
