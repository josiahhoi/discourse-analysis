/**
 * Paste-import parser.
 *
 * Turns text pasted into the import box into { propositions, verseRefs }.
 * Explicit [n]/[n:m] markers always win; without them the parser recognizes
 * what Bible software actually puts on the clipboard — Logos (Copy Bible
 * Verses) and Accordance both paste plain text with bare or superscript verse
 * numbers, per-verse "Rom 3:21" prefixes, and reference headers or trailing
 * citations like "(Rom 3:21-26)". Detection is deliberately conservative:
 * bare numbers only count as verses when they form a strictly consecutive
 * run, and reference lines only count when the book resolves in the app's
 * book table — otherwise the text imports as one proposition, exactly like
 * before.
 */

// Superscript digits paste from Logos/Accordance where the on-screen verse
// number was superscripted. Nothing else in Bible text uses them, so a run
// maps directly to a verse marker.
const SUPERSCRIPT_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const SUPERSCRIPT_DIGIT_RUN = /[⁰¹²³⁴-⁹]+/g;
// Superscript/modifier letters are footnote or cross-reference markers.
const SUPERSCRIPT_LETTERS = /[ʰ-ʸᵃ-ᵪᶜ-ᶿⁱⁿ]+/g;

/**
 * Clean pasted text and convert unambiguous verse signals into [n] markers so
 * every detection path funnels into the one marker-splitting routine.
 */
function normalizePaste(raw) {
  return String(raw)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // zero-width chars / BOM
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/¶/g, ' ') // pilcrows (Accordance paragraph marks)
    .replace(SUPERSCRIPT_LETTERS, '')
    .replace(/\[[a-z]{1,2}\]/g, '') // [a]-style footnote markers (never digits)
    .replace(SUPERSCRIPT_DIGIT_RUN, (run) => `[${run.split('').map(c => SUPERSCRIPT_DIGITS[c]).join('')}] `)
    .replace(/[^\S\n]+/g, ' ');
}

/**
 * Parse one candidate reference string ("Rom 3:21-26", "1 Cor. 13", with an
 * optional translation tag like "ESV" tacked on). Returns null unless the
 * book resolves in BOLLS_BOOKS — that table lookup is the false-positive
 * gate that keeps "Meeting notes 3:21" from being read as a reference.
 */
function parseReferenceText(text) {
  const cleaned = String(text)
    .replace(/[‐‑‒–—―−]/g, '-') // dashes → hyphen (same class as normalizeRefQuery)
    .replace(/[,;]?\s*\(?[A-Z][A-Za-z0-9]{1,7}\)?\s*$/, (tag, offset, s) => /\d/.test(s.slice(0, offset)) ? '' : tag) // trailing translation tag, only after digits exist
    .trim();
  const m = cleaned.match(/^([1-3]?\s*[A-Za-z][A-Za-z.\s]*?)\s*(\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?$/);
  if (!m) return null;

  const bookKey = m[1].trim().toLowerCase().replace(/[.\s]+/g, '');
  if (!(bookKey in DA_CONSTANTS.BOLLS_BOOKS)) return null;

  const bookName = DA_CONSTANTS.FULL_BOOK_NAMES[bookKey] ||
    m[1].trim().replace(/\.$/, '').replace(/^./, c => c.toUpperCase());
  const chapter = parseInt(m[2]);
  const startVerse = m[3] ? parseInt(m[3]) : null;
  const endVerse = m[4] ? parseInt(m[4]) : startVerse;

  let refString = `${bookName} ${chapter}`;
  if (startVerse) refString += `:${startVerse}` + (endVerse !== startVerse ? `-${endVerse}` : '');
  return { bookKey, bookName, chapter, startVerse, endVerse, refString };
}

/**
 * Pull a reference out of a header line ("Romans 3:21-26" on its own line
 * before the text) or a trailing citation ("…more. (Rom 3:21-26)"). Returns
 * { ref, body } where body is the text with the reference consumed.
 */
function extractReference(text) {
  const newline = text.indexOf('\n');
  if (newline !== -1) {
    const headerRef = parseReferenceText(text.slice(0, newline));
    if (headerRef && text.slice(newline + 1).trim()) {
      return { ref: headerRef, body: text.slice(newline + 1) };
    }
  }

  const trailer = text.match(/\(([^()\n]{2,60})\)\s*$/);
  if (trailer) {
    const trailerRef = parseReferenceText(trailer[1]);
    const body = text.slice(0, trailer.index);
    if (trailerRef && body.trim()) return { ref: trailerRef, body };
  }

  return { ref: null, body: text };
}

/**
 * The single splitting routine: one proposition per [n]/[n:m] marker.
 * Verbatim port of the original parsePastedText loop (ui-dialogs.js) so
 * marker semantics — including the sequential-index refs for unmarked
 * parts — are unchanged.
 */
function splitOnMarkers(text, defaultStartVerse) {
  const verseParts = text.split(/(?=\[\d+(?::\d+)?\])/);
  const props = [];
  const refs = [];
  let hasMarkers = false;
  for (const part of verseParts) {
    const m = part.match(/^\[(\d+)(?::(\d+))?\]\s*(.*)$/s);
    if (m) {
      hasMarkers = true;
      const num = m[2] ? `${m[1]}:${m[2]}` : m[1];
      const content = m[3].trim();
      if (content) {
        props.push(content);
        refs.push(num);
      }
    } else if (part.trim()) {
      props.push(part.trim());
      refs.push(hasMarkers || refs.length > 0 ? String(props.length) : defaultStartVerse);
    }
  }
  return { propositions: props, verseRefs: refs };
}

/**
 * Line mode: each verse on its own line, prefixed with "Rom 3:21", "3:21",
 * or a bare number ("21 But now…" — Logos CBV one-verse-per-line style).
 * Explicit book/chapter prefixes are self-evidently verse references; bare
 * numbers must form a strictly consecutive run of at least two lines — a
 * single bare-number line falls through to flow mode, which can tell one
 * verse from a paragraph with more verse numbers embedded in it.
 * Returns { marked, derivedRef } or null.
 */
function detectVerseLines(body) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const parsed = lines.map((line) => {
    let m = line.match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z.\s]*?)\s+(\d{1,3}):(\d{1,3})\s+(\S.*)$/s);
    if (m) {
      const bookKey = m[1].trim().toLowerCase().replace(/[.\s]+/g, '');
      if (bookKey in DA_CONSTANTS.BOLLS_BOOKS) {
        return { bookKey, chapter: parseInt(m[2]), verse: parseInt(m[3]), text: m[4], explicit: true };
      }
    }
    m = line.match(/^(\d{1,3}):(\d{1,3})\s+(\S.*)$/s);
    if (m) return { chapter: parseInt(m[1]), verse: parseInt(m[2]), text: m[3], explicit: true };
    m = line.match(/^(\d{1,3})[.)]?\s+(\S.*)$/s);
    if (m) return { verse: parseInt(m[1]), text: m[2], explicit: false };
    return { text: line };
  });

  const candidates = parsed.filter(p => p.verse !== undefined);
  if (!candidates.length) return null;

  if (!candidates.every(c => c.explicit)) {
    // Bare numbers: require a strictly consecutive ascending run of at least
    // two — years, counts, and list numbering don't survive that.
    const consecutive = candidates.every((c, i) => i === 0 || c.verse === candidates[i - 1].verse + 1);
    if (!consecutive || candidates.length < 2) return null;
  }

  const chapters = new Set(candidates.filter(c => c.chapter !== undefined).map(c => c.chapter));
  const multiChapter = chapters.size > 1;
  const marked = parsed.map((p) => {
    if (p.verse === undefined) return p.text; // continuation line — joins the previous verse
    const ref = multiChapter && p.chapter !== undefined ? `${p.chapter}:${p.verse}` : String(p.verse);
    return `[${ref}] ${p.text}`;
  }).join('\n');

  // Accordance's per-verse "Rom 3:21 …" prefixes carry the passage reference
  // even without a header/citation — reconstruct it from the first book line.
  let derivedRef;
  const firstBook = parsed.find(p => p.bookKey);
  if (firstBook && !multiChapter) {
    const bookName = DA_CONSTANTS.FULL_BOOK_NAMES[firstBook.bookKey] || firstBook.bookKey;
    const first = candidates[0].verse;
    const last = candidates[candidates.length - 1].verse;
    derivedRef = `${bookName} ${firstBook.chapter}:${first}` + (last !== first ? `-${last}` : '');
  }
  return { marked, derivedRef };
}

/**
 * Flow mode: verse numbers embedded in running text ("…the Prophets— 22 the
 * righteousness of God…"). A number bounded by whitespace and followed by a
 * word only counts once a consecutive chain is established from the anchor
 * (the detected reference's start verse, or the first candidate). "c:v"
 * tokens restart the chain at v (chapter boundaries in long copies).
 * Rejected numbers stay as ordinary text. Returns marked-up text or null.
 */
function detectVerseFlow(body, expectedStart) {
  const tokenRegex = /(?:^|[\s"'“‘(])(\d{1,3})(?::(\d{1,3}))?(?=\s+["'“‘(]?\p{L})/dgu;
  const accepted = [];
  let expected = expectedStart;
  let sawLeadingText = false;

  for (const m of body.matchAll(tokenRegex)) {
    const numStart = m.indices[1][0];
    const chapter = m[2] ? parseInt(m[1]) : null;
    const verse = m[2] ? parseInt(m[2]) : parseInt(m[1]);

    if (!accepted.length) {
      sawLeadingText = body.slice(0, numStart).trim().length > 0;
      // Anchor: must match the reference when we have one (allowing +1 when
      // text precedes it — a copy that starts mid-verse). Without a
      // reference the first candidate anchors provisionally.
      if (expected !== null && !chapter) {
        if (verse !== expected && !(sawLeadingText && verse === expected + 1)) continue;
      }
    } else if (!chapter && verse !== expected) {
      continue; // not the next verse — an ordinary number in the text
    }
    accepted.push({ start: numStart, end: m.indices[0][1], chapter, verse });
    expected = verse + 1;
  }

  const strongEnough = accepted.length >= 2 || (accepted.length === 1 && expectedStart !== null);
  if (!strongEnough) return null;

  const chapters = new Set(accepted.filter(a => a.chapter !== null).map(a => a.chapter));
  const multiChapter = chapters.size > 1;
  let out = '';
  let pos = 0;
  for (const a of accepted) {
    out += body.slice(pos, a.start);
    const ref = a.chapter !== null && multiChapter ? `${a.chapter}:${a.verse}` : String(a.verse);
    out += `[${ref}] `;
    pos = a.end;
  }
  out += body.slice(pos);

  if (sawLeadingText && expectedStart !== null && accepted[0].verse === expectedStart + 1) {
    out = `[${expectedStart}] ${out}`; // text before the first number is the reference's first verse
  }
  return out;
}

/**
 * Parse pasted passage text into { propositions, verseRefs, passageRef?,
 * detection }. detection: 'markers' | 'lines' | 'flow' | 'none'.
 * Backward compatible with the old two-key return — extra keys are additive.
 */
function parsePastedText(raw, defaultStartVerse = '1') {
  const normalized = normalizePaste(raw);
  const { ref, body } = extractReference(normalized);
  const passageRef = ref ? ref.refString : undefined;
  // A detected reference supplies the start verse unless the user set one.
  const startVerse = (defaultStartVerse === '1' && ref?.startVerse) ? String(ref.startVerse) : defaultStartVerse;
  const expectedStart = ref?.startVerse ?? null;

  if (/\[\d+(?::\d+)?\]/.test(body)) {
    return { ...splitOnMarkers(body, startVerse), passageRef, detection: 'markers' };
  }

  const lineResult = detectVerseLines(body);
  if (lineResult !== null) {
    return {
      ...splitOnMarkers(lineResult.marked, startVerse),
      passageRef: passageRef || lineResult.derivedRef,
      detection: 'lines'
    };
  }

  const flowMarked = detectVerseFlow(body, expectedStart);
  if (flowMarked !== null) {
    return { ...splitOnMarkers(flowMarked, startVerse), passageRef, detection: 'flow' };
  }

  return { ...splitOnMarkers(body, startVerse), passageRef, detection: 'none' };
}

window.DA_PASTE = { parsePastedText };
