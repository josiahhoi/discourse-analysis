const test = require('node:test');
const assert = require('node:assert');
const { createSandbox, load } = require('./helpers/harness');

function setup() {
  const sb = createSandbox();
  load(sb, 'js/utils/constants.js');
  load(sb, 'js/utils/paste-parser.js');
  return sb;
}

function parse(raw, startVerse) {
  return setup().DA_PASTE.parsePastedText(raw, startVerse);
}

test('markers: [n] and [n:m] split exactly as before', () => {
  const r = parse('[1] In the beginning [2] and the earth');
  assert.deepEqual(r.propositions, ['In the beginning', 'and the earth']);
  assert.deepEqual(r.verseRefs, ['1', '2']);
  assert.equal(r.detection, 'markers');

  const r2 = parse('[3:14] For God so loved');
  assert.deepEqual(r2.verseRefs, ['3:14']);
});

test('markers: unmarked text keeps the defaultStartVerse label', () => {
  const r = parse('But now the righteousness of God', '21');
  assert.deepEqual(r.propositions, ['But now the righteousness of God']);
  assert.deepEqual(r.verseRefs, ['21']);
  assert.equal(r.detection, 'none');
});

test('markers: empty input yields empty arrays', () => {
  const r = parse('   ');
  assert.deepEqual(r.propositions, []);
  assert.deepEqual(r.verseRefs, []);
});

test('markers beat bare numbers', () => {
  const r = parse('[1] In 40 days [2] more text');
  assert.deepEqual(r.propositions, ['In 40 days', 'more text']);
  assert.deepEqual(r.verseRefs, ['1', '2']);
  assert.equal(r.detection, 'markers');
});

test('flow: Logos CBV flowing paragraph with en-dash header', () => {
  const r = parse('Romans 3:21–26\n21 But now the righteousness of God has been manifested apart from the law, 22 even the righteousness of God through faith in Jesus Christ for all who believe. 23 for all have sinned and fall short, 24 and are justified by his grace as a gift, 25 whom God put forward as a propitiation by his blood, 26 It was to show his righteousness at the present time.');
  assert.equal(r.detection, 'flow');
  assert.equal(r.propositions.length, 6);
  assert.deepEqual(r.verseRefs, ['21', '22', '23', '24', '25', '26']);
  assert.equal(r.passageRef, 'Romans 3:21-26');
  assert.ok(r.propositions[0].startsWith('But now'));
  assert.ok(r.propositions[5].startsWith('It was to show'));
});

test('flow: header start verse anchors — non-matching numbers stay text', () => {
  const r = parse('Romans 3:21-22\n21 But now in 40 days the law, 22 even the righteousness.');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.ok(r.propositions[0].includes('40 days'));
});

test('flow: leading text before the second verse number is the first verse', () => {
  const r = parse('Romans 3:21-22\nBut now the righteousness of God, 22 even the righteousness through faith.');
  assert.equal(r.detection, 'flow');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.ok(r.propositions[0].startsWith('But now'));
});

test('lines: Logos CBV one-verse-per-line with bare numbers', () => {
  const r = parse('21 But now the righteousness of God\n22 even the righteousness through faith\n23 for all have sinned');
  assert.equal(r.detection, 'lines');
  assert.deepEqual(r.verseRefs, ['21', '22', '23']);
  assert.equal(r.propositions[2], 'for all have sinned');
});

test('lines: Accordance per-verse book prefixes derive the passage ref', () => {
  const r = parse('Romans 3:21 But now apart from the Law the righteousness of God\nRomans 3:22 even the righteousness of God through faith');
  assert.equal(r.detection, 'lines');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.equal(r.passageRef, 'Romans 3:21-22');
});

test('lines: trailing citation fills the passage ref and is consumed', () => {
  const r = parse('21 But now the righteousness of God\n22 even the righteousness through faith\n(Rom 3:21-22 ESV)');
  assert.equal(r.detection, 'lines');
  assert.equal(r.passageRef, 'Romans 3:21-22');
  assert.ok(!r.propositions.join(' ').includes('(Rom'));
});

test('superscript verse numbers become markers; superscript letters stripped', () => {
  const r = parse('²¹But nowᵃ the righteousness ²²even the righteousness');
  assert.equal(r.detection, 'markers');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.ok(!r.propositions[0].includes('ᵃ'));
});

test('bracketed footnote letters are stripped, digits kept', () => {
  const r = parse('the law[a] and the Prophets');
  assert.equal(r.detection, 'none');
  assert.deepEqual(r.propositions, ['the law and the Prophets']);
});

test('guard: years and counts in prose do not split', () => {
  const r = parse('In the year 70 the temple fell. Then 40 years passed before anything changed.');
  assert.equal(r.detection, 'none');
  assert.equal(r.propositions.length, 1);
});

test('guard: small numbers in prose do not split', () => {
  const r = parse('Give me 5 loaves and 2 fish for the crowd.');
  assert.equal(r.detection, 'none');
  assert.equal(r.propositions.length, 1);
});

test('guard: non-book header is not a reference', () => {
  const r = parse('Meeting notes 3:21\nsome agenda text here');
  assert.equal(r.passageRef, undefined);
  assert.equal(r.detection, 'none');
});

test('single verse with matching header', () => {
  const r = parse('John 3:16\n16 For God so loved the world');
  assert.deepEqual(r.verseRefs, ['16']);
  assert.deepEqual(r.propositions, ['For God so loved the world']);
  assert.equal(r.passageRef, 'John 3:16');
});

test('header without body numbers still labels the single proposition', () => {
  const r = parse('Romans 3:21\nBut now the righteousness of God has been manifested');
  assert.equal(r.detection, 'none');
  assert.deepEqual(r.verseRefs, ['21']);
  assert.equal(r.passageRef, 'Romans 3:21');
});

test('user-typed start verse beats a detected reference', () => {
  const r = parse('Romans 3:21\nBut now the righteousness', '7');
  assert.deepEqual(r.verseRefs, ['7']);
});

// ── Regressions from the 3.2.0 review: false positives ──────────────────────

test('guard: numbered lists ("1." / "2.") are not verses', () => {
  const r = parse('1. Pray for the team\n2. Read chapter 4\n3. Bring snacks');
  assert.equal(r.detection, 'none');
  assert.equal(r.propositions.length, 1);
});

test('guard: clock times in flowing prose do not split', () => {
  const r = parse('We meet at 9:30 in the morning and 10:15 at the latest.');
  assert.equal(r.detection, 'none');
  assert.equal(r.propositions.length, 1);
});

test('guard: schedule lines with c:v-shaped times do not split', () => {
  const r = parse('9:00 Standup\n10:30 Review standup notes');
  assert.equal(r.detection, 'none');
  assert.equal(r.propositions.length, 1);

  const single = parse('12:30 Lunch with the team');
  assert.equal(single.detection, 'none');
  assert.deepEqual(single.verseRefs, ['1']);
});

test('guard: consecutive counts in prose do not split without an anchor at the start', () => {
  const r = parse('Give me 4 loaves and 5 fish for the crowd.');
  assert.equal(r.detection, 'none');
  assert.equal(r.propositions.length, 1);
});

test('flow: a cross-reference ("see 16:25") does not hijack the verse chain', () => {
  const r = parse('Romans 3:21-23\n21 But now the righteousness see 16:25 for the doxology, 22 even the righteousness, 23 for all have sinned');
  assert.deepEqual(r.verseRefs, ['21', '22', '23']);
  assert.ok(r.propositions[0].includes('see 16:25'));
});

// ── Regressions from the 3.2.0 review: text loss & wrong refs ────────────────

test('KJV-style bracketed italics survive; single-letter [a] is still stripped', () => {
  const r = parse('The LORD [is] my shepherd; I shall not want.');
  assert.deepEqual(r.propositions, ['The LORD [is] my shepherd; I shall not want.']);
});

test('superscript footnote numbers attached to words are stripped, not split on', () => {
  const r = parse('In the beginning¹ God created² the heavens and the earth.');
  assert.equal(r.detection, 'none');
  assert.deepEqual(r.propositions, ['In the beginning God created the heavens and the earth.']);
});

test('flow: chapter-crossing copies keep the chapter in every ref', () => {
  const r = parse('Romans 11:36\n36 For from him and through him, 12:1 I appeal to you brothers, 2 Do not be conformed');
  assert.equal(r.detection, 'flow');
  assert.deepEqual(r.verseRefs, ['11:36', '12:1', '12:2']);
});

test('flow: leading text before a next-chapter restart is the reference verse', () => {
  const r = parse('Romans 3:31\nDo we then overthrow the law? By no means! 4:1 What then shall we say');
  assert.equal(r.detection, 'flow');
  assert.deepEqual(r.verseRefs, ['3:31', '4:1']);
  assert.ok(r.propositions[0].startsWith('Do we then'));
});

test('flow: an opening quote before a verse number stays with that verse', () => {
  const r = parse('Romans 3:21-22\n21 But now God said, “22 even the righteousness through faith.');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.ok(!r.propositions[0].includes('“'), 'verse 21 has no stray opening quote');
  assert.ok(r.propositions[1].startsWith('“even'), 'verse 22 keeps its opening quote');
});

// ── Regressions from the 3.2.0 review: reference extraction ──────────────────

test('header: multi-word translation tags like (NASB 2020) are recognized', () => {
  const r = parse('Romans 3:21-22 (NASB 2020)\n21 But now the righteousness of God, 22 even the righteousness through faith.');
  assert.equal(r.passageRef, 'Romans 3:21-22');
  assert.deepEqual(r.verseRefs, ['21', '22']);
});

test('own-line trailing citation is consumed and fills the passage ref', () => {
  const r = parse('21 But now the righteousness of God,\n22 even the righteousness through faith.\nRomans 3:21–22 (ESV)');
  assert.equal(r.passageRef, 'Romans 3:21-22');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.ok(!r.propositions.join(' ').includes('Romans 3:21'));
});

test('header plus parenthesized trailer: both are consumed, header wins', () => {
  const r = parse('Romans 3:21-22\n21 But now the righteousness, 22 even the righteousness. (Rom 3:21-22)');
  assert.equal(r.passageRef, 'Romans 3:21-22');
  assert.ok(!r.propositions.join(' ').includes('(Rom'));
});

test('leading pericope heading line is dropped (lines mode)', () => {
  const r = parse('The Righteousness of God\n21 But now the righteousness\n22 even the righteousness');
  assert.equal(r.detection, 'lines');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.ok(!r.propositions.join(' ').includes('Righteousness of God'));
});

test('leading junk line under a header is dropped (flow mode)', () => {
  const r = parse('Romans 3:21-22\nNew International Version\n21 But now the righteousness, 22 This righteousness is given');
  assert.equal(r.detection, 'flow');
  assert.deepEqual(r.verseRefs, ['21', '22']);
  assert.ok(r.propositions[0].startsWith('But now'));
});
