/**
 * Tests for the main point summary's comment anchoring (main-point-summary.js).
 *
 * Summary comments store a { start, end } character range into the summary
 * text, and the summary is free-form editable — so every edit must carry the
 * ranges along (remapRange), and rendering must split the text into plain and
 * highlighted runs (segments). The DOM wiring is covered by the e2e spec.
 */
const { test } = require('node:test');
// Non-strict assert: sandbox values live in another realm (see editor-logic.test.js).
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup() {
  const sb = createSandbox();
  load(sb, 'js/services/state.js');
  load(sb, 'js/utils/main-point-summary.js');
  return sb.DA_SUMMARY;
}

const TEXT = 'God justifies the ungodly by faith.';
const at = (s) => ({ start: TEXT.indexOf(s), end: TEXT.indexOf(s) + s.length });
const word = (text, r) => text.slice(r.start, r.end);

test('typing before a comment shifts it onto the same words', () => {
  const { remapRange } = setup();
  const r = at('ungodly');
  const next = 'Truly, ' + TEXT;
  assert.equal(word(next, remapRange(TEXT, next, r.start, r.end)), 'ungodly');
});

test('typing after a comment leaves it alone', () => {
  const { remapRange } = setup();
  const r = at('ungodly');
  assert.deepEqual(remapRange(TEXT, TEXT + ' Amen.', r.start, r.end), r);
});

test('typing inside a comment grows it', () => {
  const { remapRange } = setup();
  const r = at('the ungodly');
  const next = TEXT.replace('the ungodly', 'the truly ungodly');
  assert.equal(word(next, remapRange(TEXT, next, r.start, r.end)), 'the truly ungodly');
});

test('replacing a word that straddles the comment start clamps instead of drifting', () => {
  const { remapRange } = setup();
  const r = at('ungodly by');
  const next = TEXT.replace('the ungodly', 'sinners');
  const out = remapRange(TEXT, next, r.start, r.end);
  assert.equal(word(next, out), 'sinners by');
});

test('deleting the commented words collapses the range (start === end) rather than moving it', () => {
  const { remapRange } = setup();
  const r = at('ungodly ');
  const next = TEXT.replace('ungodly ', '');
  const out = remapRange(TEXT, next, r.start, r.end);
  assert.equal(out.start, out.end);
  assert.equal(out.start, TEXT.indexOf('ungodly'));
});

test('identical text is a no-op', () => {
  const { remapRange } = setup();
  assert.deepEqual(remapRange(TEXT, TEXT, 3, 9), { start: 3, end: 9 });
});

test('segments: plain text when there are no comments', () => {
  const { segments } = setup();
  assert.deepEqual(segments('abc', []), [{ text: 'abc', id: null }]);
});

test('segments: a comment splits the text into plain / marked / plain runs', () => {
  const { segments } = setup();
  const r = at('ungodly');
  assert.deepEqual(segments(TEXT, [{ ...r, id: 'c1' }]), [
    { text: 'God justifies the ', id: null },
    { text: 'ungodly', id: 'c1' },
    { text: ' by faith.', id: null },
  ]);
});

test('segments: the active target wins an overlap; collapsed and out-of-range comments draw nothing', () => {
  const { segments } = setup();
  const out = segments('abcdef', [
    { start: 0, end: 4, id: 'c1' },
    { start: 2, end: 6, id: 'active-comment-target' },
    { start: 3, end: 3, id: 'gone' },
    { start: 10, end: 12, id: 'stale' },
  ]);
  assert.deepEqual(out, [
    { text: 'ab', id: 'c1' },
    { text: 'cdef', id: 'active-comment-target' },
  ]);
  assert.equal(out.map((s) => s.text).join(''), 'abcdef', 'runs always rebuild the full text');
});
