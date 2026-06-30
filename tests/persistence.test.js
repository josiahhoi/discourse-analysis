/**
 * Tests for normalizeBracketData — the migration layer every imported/cloud
 * file passes through. It normalizes verse refs to bare numbers and upgrades
 * legacy numeric bracket endpoints into the current pN/bN reference scheme.
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

test('leaves modern pN/bN brackets untouched', () => {
  const sb = setup();
  const brackets = [{ from: 'p0', to: 'p1', type: 'series' }];
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['a', 'b'],
    verseRefs: ['1', '2'],
    brackets,
  });
  assert.deepEqual(out.brackets, brackets);
});

test('migrates legacy numeric brackets into nested pN/bN refs', () => {
  const sb = setup();
  const out = sb.DA_PERSISTENCE.normalizeBracketData({
    propositions: ['a', 'b', 'c'],
    verseRefs: ['1', '2', '3'],
    brackets: [
      { from: 0, to: 2, type: 'ground' }, // outer
      { from: 0, to: 1, type: 'series' }, // inner
    ],
  });
  // Inner bracket is processed first (narrower), so it becomes b0; the outer
  // then points at b0 for its left end and the bare prop c for its right end.
  assert.deepEqual(
    out.brackets.map((b) => ({ from: b.from, to: b.to })),
    [
      { from: 'p0', to: 'p1' },
      { from: 'b0', to: 'p2' },
    ]
  );
  assert.equal(out.version, 1);
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
