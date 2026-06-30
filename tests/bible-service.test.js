/**
 * Tests for the passage-reference parser and the bolls.life verse-text parser.
 * These are sloppy-mode top-level function declarations, so loading the file in
 * the sandbox exposes them as globals (they aren't on window.DA_BIBLE).
 */
const { test } = require('node:test');
// Non-strict assert: sandbox values live in another realm (see editor-logic.test.js).
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup() {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/services/bible-service.js');
  return sb;
}

test('parsePassageReference: verse range', () => {
  const sb = setup();
  const ref = sb.parsePassageReference('John 1:1-5');
  assert.equal(ref.file, 'John.txt');
  assert.equal(ref.bookName, 'John');
  assert.equal(ref.chapter, 1);
  assert.equal(ref.startVerse, 1);
  assert.equal(ref.endVerse, 5);
  assert.equal(ref.hasVerses, true);
});

test('parsePassageReference: single verse sets start == end', () => {
  const sb = setup();
  const ref = sb.parsePassageReference('Romans 8:28');
  assert.equal(ref.file, 'Rom.txt');
  assert.equal(ref.startVerse, 28);
  assert.equal(ref.endVerse, 28);
});

test('parsePassageReference: whole chapter has no verses', () => {
  const sb = setup();
  const ref = sb.parsePassageReference('Eph 1');
  assert.equal(ref.file, 'Eph.txt');
  assert.equal(ref.bookName, 'Ephesians');
  assert.equal(ref.chapter, 1);
  assert.equal(ref.hasVerses, false);
  assert.equal(ref.startVerse, null);
});

test('parsePassageReference: numbered book name ("1 John")', () => {
  const sb = setup();
  const ref = sb.parsePassageReference('1 John 2:3');
  assert.equal(ref.file, '1John.txt');
  assert.equal(ref.bookName, '1 John');
  assert.equal(ref.chapter, 2);
});

test('parsePassageReference: unrecognized book parses but has no SBLGNT file', () => {
  const sb = setup();
  const ref = sb.parsePassageReference('Foobar 1:1');
  assert.equal(ref.file, undefined);
  assert.equal(ref.bookName, 'Foobar');
});

test('parsePassageReference: returns null for unparseable input', () => {
  const sb = setup();
  assert.equal(sb.parsePassageReference('not a reference!!!'), null);
});

test('parseBollsText: splits on [n] verse markers', () => {
  const sb = setup();
  const out = sb.parseBollsText('[1] In the beginning [2] God created');
  assert.deepEqual(out.propositions, ['In the beginning', 'God created']);
  assert.deepEqual(out.verseRefs, ['1', '2']);
});

test('parseBollsText: handles multi-digit verse numbers', () => {
  const sb = setup();
  const out = sb.parseBollsText('[9] nine [10] ten');
  assert.deepEqual(out.verseRefs, ['9', '10']);
});

test('parseBollsText: text with no markers falls back to verse 1', () => {
  const sb = setup();
  const out = sb.parseBollsText('plain text with no markers');
  assert.deepEqual(out.propositions, ['plain text with no markers']);
  assert.deepEqual(out.verseRefs, ['1']);
});

test('parseBollsText: empty input yields empty arrays', () => {
  const sb = setup();
  const out = sb.parseBollsText('   ');
  assert.deepEqual(out.propositions, []);
  assert.deepEqual(out.verseRefs, []);
});
