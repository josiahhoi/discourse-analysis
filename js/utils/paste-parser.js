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
// number was superscripted. A run is only a verse number in verse position —
// at the start of the text or after a space/opening quote, with the verse's
// text following ("²¹But now"). Attached to the tail of a word
// ("beginning¹") it is a numbered footnote marker (NET-style) and is
// stripped like the letter markers below.
const SUPERSCRIPT_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const SUPERSCRIPT_VERSE_RUN = /(?<=^|[\s"'“‘(])[⁰¹²³⁴-⁹]+(?=\s?["'“‘(]?\p{L})/gu;
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
    // Single [a]-style footnote letters only — two-letter brackets are
    // KJV/NKJV italic supplied words like "[is]" and must survive.
    .replace(/\[[a-z]\]/g, '')
    .replace(SUPERSCRIPT_VERSE_RUN, (run) => `[${run.split('').map(c => SUPERSCRIPT_DIGITS[c]).join('')}] `)
    .replace(SUPERSCRIPT_DIGIT_RUN, '') // remaining runs are footnote numbers
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
    // Trailing translation tag ("ESV", "(NASB 2020)"), only after digits
    // exist; the optional second token covers edition years.
    .replace(/[,;]?\s*\(?[A-Z][A-Za-z0-9]{1,7}(?:\s+[A-Z0-9]{2,8})?\)?\s*$/, (tag, offset, s) => /\d/.test(s.slice(0, offset)) ? '' : tag)
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
 * before the text), an own-line trailing citation ("Romans 3:21-22 (ESV)" as
 * the last line), or a parenthesized trailing citation ("…more.
 * (Rom 3:21-26)"). All three are consumed from the body even when more than
 * one is present (a Logos copy can carry both); the header wins as the ref.
 * Returns { ref, body } where body is the text with the references consumed.
 */
function extractReference(text) {
  let ref = null;
  let body = text;

  const newline = body.indexOf('\n');
  if (newline !== -1) {
    const headerRef = parseReferenceText(body.slice(0, newline));
    if (headerRef && body.slice(newline + 1).trim()) {
      ref = headerRef;
      body = body.slice(newline + 1);
    }
  }

  const lastBreak = body.lastIndexOf('\n');
  if (lastBreak !== -1) {
    const lastLineRef = parseReferenceText(body.slice(lastBreak + 1));
    if (lastLineRef && body.slice(0, lastBreak).trim()) {
      ref = ref || lastLineRef;
      body = body.slice(0, lastBreak);
    }
  }

  const trailer = body.match(/\(([^()\n]{2,60})\)\s*$/);
  if (trailer) {
    const trailerRef = parseReferenceText(trailer[1]);
    if (trailerRef && body.slice(0, trailer.index).trim()) {
      ref = ref || trailerRef;
      body = body.slice(0, trailer.index);
    }
  }

  return { ref, body };
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
 * Book-prefixed lines are self-evidently verse references (the book-table
 * lookup is the gate); bare numbers and bare "c:v" prefixes prove nothing
 * alone (list numbering, schedule times), so they must form a coherent run
 * of at least two lines — each continuing the chapter (verse + 1) or opening
 * the next chapter at verse 1. A single bare-number line falls through to
 * flow mode, which can tell one verse from a paragraph with more verse
 * numbers embedded in it. Returns { marked, derivedRef } or null.
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
    if (m) return { chapter: parseInt(m[1]), verse: parseInt(m[2]), text: m[3], explicit: false };
    m = line.match(/^(\d{1,3})\s+(\S.*)$/s); // no "1." / "1)" — that's list numbering, not a verse
    if (m) return { verse: parseInt(m[1]), text: m[2], explicit: false };
    return { text: line };
  });

  const candidates = parsed.filter(p => p.verse !== undefined);
  if (!candidates.length) return null;
  if (candidates.some(c => c.verse < 1 || c.chapter === 0)) return null; // no verse/chapter zero

  if (!candidates.every(c => c.explicit)) {
    if (candidates.length < 2) return null;
    const coherent = candidates.every((c, i) => {
      if (i === 0) return true;
      const prev = candidates[i - 1];
      const sameChapter = c.chapter === undefined || prev.chapter === undefined || c.chapter === prev.chapter;
      if (sameChapter && c.verse === prev.verse + 1) return true;
      return c.chapter !== undefined && prev.chapter !== undefined && c.chapter === prev.chapter + 1 && c.verse === 1;
    });
    if (!coherent) return null;
  }

  const chapters = new Set(candidates.filter(c => c.chapter !== undefined).map(c => c.chapter));
  const multiChapter = chapters.size > 1;
  // Lines before the first verse line (pericope headings, "New International
  // Version") can't be verse content — drop them. Later verse-less lines
  // still join the previous verse.
  const firstVerseIdx = parsed.findIndex(p => p.verse !== undefined);
  const marked = parsed.slice(firstVerseIdx).map((p) => {
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
 * word only counts once a consecutive chain is established from the anchor —
 * the detected reference's start verse, or, with no reference, a number at
 * the very start of the text. "c:v" tokens are c:v-shaped like clock times
 * and cross-references ("see 16:25"), so they only count when they
 * corroborate the chain: the reference's own chapter as the anchor, or a
 * restart at the next chapter's verse 1. Rejected numbers stay as ordinary
 * text. Returns marked-up text or null.
 */
function detectVerseFlow(body, expectedStart, expectedChapter) {
  const tokenRegex = /(?:^|[\s"'“‘(])(\d{1,3})(?::(\d{1,3}))?(?=\s+["'“‘(]?\p{L})/dgu;
  const OPENING_DELIMS = new Set(['"', "'", '“', '‘', '(']);
  const accepted = [];
  let expected = expectedStart;
  let currentChapter = expectedChapter;
  let multiChapter = false;
  let sawLeadingText = false;

  for (const m of body.matchAll(tokenRegex)) {
    const numStart = m.indices[1][0];
    const chapter = m[2] ? parseInt(m[1]) : null;
    const verse = m[2] ? parseInt(m[2]) : parseInt(m[1]);
    if (verse < 1 || chapter === 0) continue; // no verse/chapter zero

    if (!accepted.length) {
      sawLeadingText = body.slice(0, numStart).trim().length > 0;
      if (chapter !== null) {
        // A "c:v" anchor must corroborate the detected reference: its own
        // chapter, or — when leading text is the tail of an unnumbered first
        // verse — the next chapter starting over at verse 1.
        const ownChapter = expectedChapter !== null && chapter === expectedChapter &&
          (expected === null || verse === expected || (sawLeadingText && verse === expected + 1));
        const nextChapter = expectedChapter !== null && sawLeadingText &&
          chapter === expectedChapter + 1 && verse === 1;
        if (!ownChapter && !nextChapter) continue;
      } else if (expected !== null) {
        // Anchor: must match the reference (allowing +1 when text precedes
        // it — a copy that starts mid-verse).
        if (verse !== expected && !(sawLeadingText && verse === expected + 1)) continue;
      } else if (sawLeadingText) {
        continue; // no reference to anchor on — only trust a number at the very start
      }
    } else if (chapter !== null) {
      // Mid-chain "c:v": the next chapter starting over at verse 1 (chapter
      // boundaries in long copies) or a redundant prefix on the expected
      // verse — anything else ("see 16:25") is ordinary text.
      const restart = (currentChapter === null || chapter === currentChapter + 1) && verse === 1;
      const redundant = (currentChapter === null || chapter === currentChapter) && verse === expected;
      if (!restart && !redundant) continue;
    } else if (verse !== expected) {
      continue; // not the next verse — an ordinary number in the text
    }
    if (chapter !== null) {
      if (currentChapter !== null && chapter !== currentChapter) multiChapter = true;
      currentChapter = chapter;
    }
    const delimStart = m.indices[0][0];
    accepted.push({
      start: numStart, end: m.indices[0][1],
      delimStart, delim: body.slice(delimStart, numStart),
      chapter: currentChapter, verse
    });
    expected = verse + 1;
  }

  const strongEnough = accepted.length >= 2 || (accepted.length === 1 && expectedStart !== null);
  if (!strongEnough) return null;

  let out = '';
  let pos = 0;
  let firstMarkerAt = 0;
  for (const a of accepted) {
    const ref = multiChapter && a.chapter !== null ? `${a.chapter}:${a.verse}` : String(a.verse);
    // An opening quote/paren immediately before the number belongs to the
    // verse that follows it, not to the previous verse's text.
    const opensVerse = OPENING_DELIMS.has(a.delim);
    const cut = opensVerse ? a.delimStart : a.start;
    if (a === accepted[0]) firstMarkerAt = out.length + (cut - pos);
    out += body.slice(pos, cut) + `[${ref}] ` + (opensVerse ? a.delim : '');
    pos = a.end;
    if (opensVerse && body[pos] === ' ') pos += 1; // "“22 even" → "[22] “even"
  }
  out += body.slice(pos);

  if (sawLeadingText) {
    const a0 = accepted[0];
    const continuesRef = expectedStart !== null &&
      (a0.verse === expectedStart + 1 ||
        (a0.chapter !== null && expectedChapter !== null && a0.chapter === expectedChapter + 1 && a0.verse === 1));
    if (continuesRef) {
      // Text before the first number is the reference's own first verse.
      const headRef = multiChapter && expectedChapter !== null
        ? `${expectedChapter}:${expectedStart}` : String(expectedStart);
      out = `[${headRef}] ${out}`;
    } else {
      // Leading text at the reference's own start verse can't be verse
      // content (a pericope heading, "New International Version") — drop it.
      out = out.slice(firstMarkerAt);
    }
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

  const flowMarked = detectVerseFlow(body, expectedStart, ref?.chapter ?? null);
  if (flowMarked !== null) {
    return { ...splitOnMarkers(flowMarked, startVerse), passageRef, detection: 'flow' };
  }

  return { ...splitOnMarkers(body, startVerse), passageRef, detection: 'none' };
}

window.DA_PASTE = { parsePastedText };
