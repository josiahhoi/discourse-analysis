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

// ── fetchFromESVApi / fetchFromNASBApi (desktop IPC bridge or web proxy) ────
// No real network — electronAPI.* is the IPC bridge to main.js and sb.fetch
// stands in for the Cloud Function proxy, matching how the renderer calls them.

test('fetchFromESVApi throws when neither the bridge nor a proxy is configured', async () => {
  const sb = setup(); // no window.electronAPI in a plain sandbox
  sb.DA_CONSTANTS.WEB_PROXY_BASE = ''; // proxy disabled
  await assert.rejects(() => sb.fetchFromESVApi('John 1:1'), /no API backend/i);
});

test('fetchFromESVApi uses the web proxy when electronAPI is absent', async () => {
  const sb = setup();
  const urls = [];
  sb.fetch = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ ok: true, text: '[1] In the beginning', canonical: 'John 1:1' }) };
  };
  const out = await sb.fetchFromESVApi('John 1:1');
  assert.ok(urls[0].includes('/esv?q=John'), 'hit the proxy /esv route');
  assert.deepEqual(out.propositions, ['In the beginning']);
  assert.equal(out.copyright, '(ESV)');
});

test('fetchFromESVApi throws when no key is configured', async () => {
  const sb = setup();
  sb.window.electronAPI = { fetchESV: async () => ({ ok: false, noKey: true }) };
  await assert.rejects(() => sb.fetchFromESVApi('John 1:1'), /no ESV API key/i);
});

test('fetchFromESVApi throws on an API error response', async () => {
  const sb = setup();
  sb.window.electronAPI = { fetchESV: async () => ({ ok: false, status: 401 }) };
  await assert.rejects(() => sb.fetchFromESVApi('John 1:1'), /401/);
});

test('fetchFromESVApi parses a successful response like Bolls text', async () => {
  const sb = setup();
  sb.window.electronAPI = {
    fetchESV: async () => ({ ok: true, text: '[1] In the beginning was the Word.', canonical: 'John 1:1' })
  };
  const out = await sb.fetchFromESVApi('John 1:1');
  assert.deepEqual(out.propositions, ['In the beginning was the Word.']);
  assert.deepEqual(out.verseRefs, ['1']);
  assert.equal(out.passageRef, 'John 1:1');
  assert.equal(out.copyright, '(ESV)');
});

// ── fetchPassageData: ESV primary → Bolls fallback ───────────────────────────
// Stub fetchFromBolls (a sibling top-level function in the same sandbox) so no
// real network call happens; only the branching logic is under test.

test('fetchPassageData falls back to Bolls when the ESV API is unavailable, tagging the source', async () => {
  const sb = setup(); // no electronAPI -> fetchFromESVApi always throws
  sb.fetchFromBolls = async () => ({ text: '[1] hello', passageRef: 'John 1:1', copyright: '(ESV)' });
  const result = await sb.fetchPassageData('esv', 'John 1:1');
  assert.equal(result.source, 'bolls');
  assert.deepEqual(result.propositions, ['hello']);
});

test('fetchPassageData uses the ESV API result when available, tagging the source', async () => {
  const sb = setup();
  sb.window.electronAPI = {
    fetchESV: async () => ({ ok: true, text: '[1] hello from ESV API', canonical: 'John 1:1' })
  };
  sb.fetchFromBolls = async () => { throw new Error('should not be called'); };
  const result = await sb.fetchPassageData('esv', 'John 1:1');
  assert.equal(result.source, 'esv-api');
  assert.deepEqual(result.propositions, ['hello from ESV API']);
});

test('fetchPassageData never attempts the ESV API for NASB (unsupported translation)', async () => {
  const sb = setup();
  let esvCalled = false;
  sb.window.electronAPI = { fetchESV: async () => { esvCalled = true; return { ok: true, text: '[1] x' }; } };
  sb.fetchFromBolls = async () => ({ text: '[1] nasb text', passageRef: 'John 1:1', copyright: '(NASB)' });
  const result = await sb.fetchPassageData('nasb', 'John 1:1');
  assert.equal(esvCalled, false);
  assert.equal(result.source, 'bolls');
});

// ── normalizeRefQuery: typographic refs (ESV API canonical uses an en dash) ──

test('parsePassageReference handles an en-dash range like the ESV API canonical form', () => {
  const sb = setup();
  const ref = sb.parsePassageReference('Romans 3:21–26'); // en dash
  assert.equal(ref.bookName, 'Romans');
  assert.equal(ref.chapter, 3);
  assert.equal(ref.startVerse, 21);
  assert.equal(ref.endVerse, 26);
});

test('fetchParallelVerses parses an en-dash reference and maps the chapter by verse', async () => {
  const sb = setup();
  const urls = [];
  sb.fetch = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => [{ verse: 21, text: 'v21 <b>tagged</b>' }, { verse: 22, text: 'v22' }] };
  };
  const map = await sb.window.DA_BIBLE.fetchParallelVerses('CUV', 'Romans 3:21–26'); // en dash
  assert.ok(urls[0].includes('/CUV/'), 'fetched from Bolls with the chosen translation');
  assert.deepEqual(map, { 21: 'v21 tagged', 22: 'v22' });
});

test('fetchParallelVerses routes SBLGNT to the GitHub source and keys the chapter by verse', async () => {
  const sb = setup();
  const urls = [];
  sb.fetch = async (url) => {
    urls.push(url);
    return {
      ok: true,
      text: async () => 'Ro 3:20\tκείμενο κ\nRo 3:21\tΝυνὶ δὲ\nRo 3:21\tχωρὶς νόμου\nRo 4:1\tἄλλο κεφάλαιο\n',
    };
  };
  const map = await sb.window.DA_BIBLE.fetchParallelVerses('SBLGNT', 'Rom 3:21-26');
  assert.ok(urls[0].includes('Rom.txt'), 'fetched the SBLGNT book file, not Bolls');
  assert.equal(map['21'], 'Νυνὶ δὲ χωρὶς νόμου', 'repeated verse lines are joined');
  assert.equal(map['20'], 'κείμενο κ', 'whole chapter returned (caller filters)');
  assert.equal(map['1'], undefined, 'other chapters excluded');
});

test('fetchParallelVerses (SBLGNT) rejects Old Testament books with a clear message', async () => {
  const sb = setup();
  sb.fetch = async () => { throw new Error('should not fetch'); };
  await assert.rejects(() => sb.window.DA_BIBLE.fetchParallelVerses('SBLGNT', 'Psalm 117'), /New Testament only/);
});

// ── NASB via API.Bible: passage-id building, bridge/proxy routing, fallback ──

test('parsePassageReference resolves USFM codes for API.Bible passage ids', () => {
  const sb = setup();
  assert.equal(sb.parsePassageReference('Rom 3:21-26').usfm, 'ROM');
  assert.equal(sb.parsePassageReference('Genesis 1').usfm, 'GEN');
  assert.equal(sb.parsePassageReference('1 John 2:3').usfm, '1JN');
  assert.equal(sb.parsePassageReference('Foobar 1:1').usfm, undefined);
});

test('fetchFromNASBApi builds API.Bible passage ids (range, single verse, chapter)', async () => {
  const sb = setup();
  const ids = [];
  sb.window.electronAPI = {
    fetchNASB: async (passageId) => {
      ids.push(passageId);
      return { ok: true, text: '[21] But now apart from the Law', canonical: 'Romans 3:21' };
    }
  };
  await sb.fetchFromNASBApi('Rom 3:21-26');
  await sb.fetchFromNASBApi('John 3:16');
  await sb.fetchFromNASBApi('Eph 1');
  assert.deepEqual(ids, ['ROM.3.21-ROM.3.26', 'JHN.3.16', 'EPH.1']);
});

test('fetchFromNASBApi rejects unrecognized books without calling any backend', async () => {
  const sb = setup();
  let called = false;
  sb.window.electronAPI = { fetchNASB: async () => { called = true; return { ok: true, text: '[1] x' }; } };
  await assert.rejects(() => sb.fetchFromNASBApi('Foobar 1:1'), /not recognized/i);
  assert.equal(called, false);
});

test('fetchPassageData (nasb) uses the API.Bible result and tags the source', async () => {
  const sb = setup();
  sb.window.electronAPI = {
    fetchNASB: async () => ({ ok: true, text: '[21] But now apart from the Law', canonical: 'Romans 3:21' })
  };
  sb.fetchFromBolls = async () => { throw new Error('should not be called'); };
  const result = await sb.fetchPassageData('nasb', 'Rom 3:21');
  assert.equal(result.source, 'nasb-api');
  assert.deepEqual(result.propositions, ['But now apart from the Law']);
  assert.equal(result.copyright, '(NASB)');
  assert.equal(result.passageRef, 'Romans 3:21');
});

test('fetchPassageData (nasb) falls back to Bolls when the NASB API fails', async () => {
  const sb = setup();
  sb.window.electronAPI = { fetchNASB: async () => ({ ok: false, status: 401 }) };
  sb.fetchFromBolls = async () => ({ text: '[21] bolls nasb text', passageRef: 'Romans 3:21', copyright: '(NASB)' });
  const result = await sb.fetchPassageData('nasb', 'Rom 3:21');
  assert.equal(result.source, 'bolls');
  assert.deepEqual(result.propositions, ['bolls nasb text']);
});

test('fetchPassageData (nasb) on web hits the proxy /nasb route', async () => {
  const sb = setup(); // no electronAPI → proxy path
  const urls = [];
  sb.fetch = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ ok: true, text: '[21] But now', canonical: 'Romans 3:21' }) };
  };
  const result = await sb.fetchPassageData('nasb', 'Rom 3:21');
  assert.equal(result.source, 'nasb-api');
  assert.ok(urls[0].includes('/nasb?passage=ROM.3.21'), 'proxy URL carries the USFM passage id');
});
