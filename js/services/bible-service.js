const PASSAGE_REF_REGEX = /^(\d?\s*[a-zA-Z\s]+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/;

/**
 * References can arrive with typographic characters the regex above doesn't
 * know: the ESV API's canonical form uses an en dash ("Romans 3:21–26"),
 * and pasted refs may carry non-breaking spaces. Normalize to plain ASCII
 * before every parse.
 */
function normalizeRefQuery(query) {
  return String(query || '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-') // hyphens, en/em dashes, minus
    .replace(/\u00A0/g, ' ') // non-breaking space
    .trim();
}

// ── SBLGNT Source (NT Greek) ──────────────────────────────────────────────────

/**
 * Download a book file and collect ONE chapter as a { verseNum: greekText }
 * map, joining repeated verse lines (paragraph breaks in the source file).
 * The single SBLGNT scan pipeline — shared by the passage import
 * (fetchSBLGNTPassage) and the parallel column (fetchSBLGNTChapterMap), so a
 * fix to the fetch/parse/join rules can never miss one of the two paths.
 */
async function fetchSBLGNTChapterVerses(ref) {
  const res = await fetch(`${DA_CONSTANTS.SBLGNT_BASE}${ref.file}`);
  if (!res.ok) throw new Error(`SBLGNT fetch error: ${res.status}`);

  const map = {};
  for (const line of (await res.text()).split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const m = parts[0].trim().match(/(\d+):(\d+)$/);
    if (!m || parseInt(m[1]) !== ref.chapter) continue;
    const v = String(parseInt(m[2]));
    const greek = parts[1].trim();
    map[v] = map[v] ? `${map[v]} ${greek}` : greek;
  }
  return map;
}

async function fetchSBLGNTPassage(query, ref) {
  if (!ref) ref = parsePassageReference(query);
  if (!ref || !ref.file) throw new Error('Book not found in SBLGNT (New Testament only).');

  const map = await fetchSBLGNTChapterVerses(ref);
  const verseNums = Object.keys(map)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((v) => !ref.hasVerses || (v >= ref.startVerse && v <= ref.endVerse));

  if (verseNums.length === 0) throw new Error('No verses found in SBLGNT for this range.');

  return {
    propositions: verseNums.map((v) => map[String(v)]),
    verseRefs: verseNums.map((v) => String(v)),
    passageRef: `${ref.bookName} ${ref.chapter}${ref.hasVerses ? ':' + ref.startVerse + (ref.endVerse !== ref.startVerse ? '-' + ref.endVerse : '') : ''}`,
    copyright: '(SBLGNT)'
  };
}

/**
 * SBLGNT counterpart of fetchParallelVerses: the whole chapter as a
 * { verseNum: greekText } map for the parallel column.
 */
async function fetchSBLGNTChapterMap(query) {
  const ref = parsePassageReference(query);
  if (!ref || !ref.file) throw new Error('SBLGNT covers the New Testament only.');

  const map = await fetchSBLGNTChapterVerses(ref);
  if (!Object.keys(map).length) throw new Error('No verses found in SBLGNT for this chapter.');
  return map;
}

// ── Bolls Source ──────────────────────────────────────────────────────────────

/**
 * Parse a reference, resolve the Bolls book id, and fetch the WHOLE chapter.
 * The single Bolls request pipeline — shared by the passage import
 * (fetchFromBolls) and the parallel column (fetchParallelVerses), so a fix to
 * the reference parsing, book lookup, or error handling can never miss one of
 * the two paths. Returns { match, verses, bookName }: `match` is the
 * PASSAGE_REF_REGEX result (book / chapter / optional verse range), `verses`
 * the raw Bolls rows.
 */
async function fetchBollsChapter(translation, query, parseErrorMsg) {
  const match = normalizeRefQuery(query).match(PASSAGE_REF_REGEX);
  if (!match) throw new Error(parseErrorMsg);

  const bookName = match[1].trim().toLowerCase().replace(/\s+/g, '');
  const bollsId = DA_CONSTANTS.BOLLS_BOOKS[bookName];
  if (!bollsId) throw new Error(`Book "${match[1]}" not recognized.`);

  const res = await fetch(`https://bolls.life/get-text/${translation}/${bollsId}/${match[2]}/`);
  if (!res.ok) throw new Error(`Bolls API error: ${res.status}`);

  const verses = await res.json();
  if (!Array.isArray(verses) || verses.length === 0) throw new Error('No verses found.');

  return { match, verses, bookName };
}

async function fetchFromBolls(translation, query) {
  const { match, verses, bookName } = await fetchBollsChapter(
    translation, query, 'Could not parse reference. Use format like "John 1:1-5"');

  const chapter = match[2];
  const startVerse = match[3] ? parseInt(match[3]) : null;
  const endVerse = match[4] ? parseInt(match[4]) : startVerse;

  const filtered = startVerse !== null
    ? verses.filter(v => v.verse >= startVerse && v.verse <= endVerse)
    : verses;

  if (filtered.length === 0) throw new Error('Verse range not found.');

  const text = filtered.map(v => `[${v.verse}] ${v.text}`).join(' ');
  const bookNameNormalized = DA_CONSTANTS.FULL_BOOK_NAMES[bookName] || match[1].trim();
  const ref = `${bookNameNormalized} ${chapter}${startVerse ? ':' + startVerse + (endVerse !== startVerse ? '-' + endVerse : '') : ''}`;

  return { text, passageRef: ref, copyright: `(${translation})` };
}

/**
 * Fetch a chapter as a per-verse map for the parallel column (Alternate
 * Views): { "97": "我何等愛慕你的律法…", … }. Unlike fetchFromBolls (which
 * joins verses into one text for the primary import path), the parallel
 * column is keyed by verse so proposition splits/merges never disturb it.
 * Returns the WHOLE chapter; the caller keeps only the verses on screen.
 */
async function fetchParallelVerses(translation, query) {
  // The Greek NT is not on Bolls - route to the app's SBLGNT source instead.
  if (translation === 'SBLGNT') return fetchSBLGNTChapterMap(query);

  const { verses } = await fetchBollsChapter(
    translation, query, 'Could not read this passage reference. Parallel needs a reference like "John 1:1-5".');

  const map = {};
  verses.forEach((v) => {
    // Display-only text: strip any markup and zero-width characters.
    map[String(v.verse)] = String(v.text)
      .replace(/<[^>]*>/g, '')
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .trim();
  });
  return map;
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function parsePassageReference(query) {
  const match = normalizeRefQuery(query).match(PASSAGE_REF_REGEX);
  if (!match) return null;

  const bookNameKey = match[1].trim().toLowerCase().replace(/\s+/g, '');
  const bookNameNormalized = DA_CONSTANTS.FULL_BOOK_NAMES[bookNameKey] || match[1].trim();
  const chapter = parseInt(match[2]);
  const hasVerses = !!match[3];
  const startVerse = hasVerses ? parseInt(match[3]) : null;
  const endVerse = match[4] ? parseInt(match[4]) : startVerse;

  return {
    file: DA_CONSTANTS.SBLGNT_BOOKS[bookNameKey],
    chapter,
    startVerse,
    endVerse,
    hasVerses,
    bookName: bookNameNormalized
  };
}

function parseBollsText(rawText) {
  // Strip zero-width characters from source text (legacy verse markers, BOM,
  // joiners) — verse boundaries are structured data now, never in-band chars.
  rawText = String(rawText).replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
  const verseParts = rawText.split(/(?=\[\d+\])/);
  const propositions = [];
  const verseRefs = [];

  for (const part of verseParts) {
    const m = part.match(/^\[(\d+)\]\s*(.*)$/s);
    if (m) {
      const num = m[1];
      const content = m[2].trim();
      if (content) {
        propositions.push(content);
        verseRefs.push(num);
      }
    } else if (part.trim()) {
      propositions.push(part.trim());
      verseRefs.push(verseRefs.length > 0 ? String(propositions.length) : '1');
    }
  }

  if (propositions.length === 0 && rawText.trim()) {
    return {
      propositions: [rawText.replace(/\[\d+\]\s*/g, '').trim()],
      verseRefs: ['1']
    };
  }

  return { propositions, verseRefs };
}

// ── ESV API (desktop only) ──────────────────────────────────────────────────
//
// The real api.esv.org fetch + API key live in the Electron main process
// (main.js), reached via the preload bridge (window.electronAPI.fetchESV).
// That bridge only exists in the Electron desktop app — the static/GitHub
// Pages web build has no server to hold the secret, so it always falls
// through to the keyless Bolls source below. See .env.example.

async function fetchFromESVApi(query) {
  if (!window.electronAPI || typeof window.electronAPI.fetchESV !== 'function') {
    throw new Error('ESV API not available in this build (web/browser).');
  }
  const res = await window.electronAPI.fetchESV(query);
  if (!res || !res.ok) {
    if (res && res.noKey) throw new Error('No ESV API key configured (.env).');
    throw new Error(`ESV API error${res && res.status ? ` (${res.status})` : ''}`);
  }
  const parsed = parseBollsText(res.text);
  if (parsed.propositions.length === 0) throw new Error('ESV API returned no verses.');
  return { ...parsed, passageRef: res.canonical || query, copyright: '(ESV)' };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Fetch a Bible passage from the best available source.
 *
 * Source priority:
 *   Greek NT  — SBLGNT (GitHub raw)
 *   Greek OT  — Bolls LXX
 *   Hebrew OT — Bolls WLC
 *   ESV       — api.esv.org (desktop app with a key) → falls back to Bolls
 *   NASB      — Bolls (the ESV API only serves the ESV translation)
 *
 * @param {string} version - 'esv' | 'nasb' | 'greek' | 'hebrew'
 * @param {string} query   - Passage reference e.g. "John 1:1-5"
 */
async function fetchPassageData(version, query) {
  if (version === 'hebrew') {
    // Westminster Leningrad Codex (Hebrew OT) via bolls.life. Returns isRTL so
    // the UI flips to right-to-left layout automatically.
    const data = await fetchFromBolls('WLC', query);
    const parsed = parseBollsText(data.text);
    return { ...parsed, passageRef: data.passageRef, copyright: data.copyright, isHebrew: true, isRTL: true };
  }

  if (version === 'greek') {
    const ref = parsePassageReference(query);
    if (ref && ref.file) {
      const result = await fetchSBLGNTPassage(query, ref);
      return { ...result, isGreek: true };
    } else {
      const data = await fetchFromBolls('LXX', query);
      const parsed = parseBollsText(data.text);
      return { ...parsed, passageRef: data.passageRef, copyright: data.copyright, isGreek: true };
    }
  }

  if (version !== 'nasb') {
    try {
      const result = await fetchFromESVApi(query);
      return { ...result, isGreek: false, source: 'esv-api' };
    } catch (_) {
      // No key, not the desktop app, network error, bad reference, etc. —
      // fall through to the keyless Bolls source below.
    }
  }

  const translation = version === 'nasb' ? 'NASB' : 'ESV';
  const data = await fetchFromBolls(translation, query);
  const parsed = parseBollsText(data.text);
  return { ...parsed, passageRef: data.passageRef, copyright: data.copyright, isGreek: false, source: 'bolls' };
}

window.DA_BIBLE = {
  fetchPassageData,
  fetchParallelVerses
};
