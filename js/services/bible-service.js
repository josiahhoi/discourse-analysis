const PASSAGE_REF_REGEX = /^(\d?\s*[a-zA-Z\s]+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/;

// ── Logos Source ───────────────────────────────────────────────────────────────

// TODO: Implement once the Logos local API endpoint format is confirmed.
// When Logos is running it exposes a local HTTP server. Consult the Logos
// Platform developer docs for the correct base URL, resource IDs (ESV, NASB,
// NA28), and response shape. Then wire up `transformLogosResponse` below.
async function fetchFromLogos(_version, _query) {
  return null;
}

// ── SBLGNT Source (NT Greek) ──────────────────────────────────────────────────

async function fetchSBLGNTPassage(query, ref) {
  if (!ref) ref = parsePassageReference(query);
  if (!ref || !ref.file) throw new Error('Book not found in SBLGNT (New Testament only).');

  const url = `${DA_CONSTANTS.SBLGNT_BASE}${ref.file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SBLGNT fetch error: ${res.status}`);

  const text = await res.text();
  const lines = text.split('\n');
  const results = [];
  const verseRefs = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const loc = parts[0].trim();
    const m = loc.match(/(\d+):(\d+)$/);
    if (!m) continue;

    const curChapter = parseInt(m[1]);
    const curVerse = parseInt(m[2]);
    const isInRange = ref.hasVerses
      ? curVerse >= ref.startVerse && curVerse <= ref.endVerse
      : true;

    if (curChapter === ref.chapter && isInRange) {
      const greek = parts[1].trim();
      if (results.length > 0 && verseRefs[verseRefs.length - 1] === String(curVerse)) {
        results[results.length - 1] += ' ' + greek;
      } else {
        results.push(greek);
        verseRefs.push(String(curVerse));
      }
    }
  }

  if (results.length === 0) throw new Error('No verses found in SBLGNT for this range.');

  return {
    propositions: results,
    verseRefs,
    passageRef: `${ref.bookName} ${ref.chapter}${ref.hasVerses ? ':' + ref.startVerse + (ref.endVerse !== ref.startVerse ? '-' + ref.endVerse : '') : ''}`,
    copyright: '(SBLGNT)'
  };
}

// ── Bolls Source ──────────────────────────────────────────────────────────────

async function fetchFromBolls(translation, query) {
  const match = query.match(PASSAGE_REF_REGEX);
  if (!match) throw new Error('Could not parse reference. Use format like "John 1:1-5"');

  const bookName = match[1].trim().toLowerCase().replace(/\s+/g, '');
  const chapter = match[2];
  const startVerse = match[3] ? parseInt(match[3]) : null;
  const endVerse = match[4] ? parseInt(match[4]) : startVerse;

  const bollsId = DA_CONSTANTS.BOLLS_BOOKS[bookName];
  if (!bollsId) throw new Error(`Book "${match[1]}" not recognized.`);

  const url = `https://bolls.life/get-text/${translation}/${bollsId}/${chapter}/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bolls API error: ${res.status}`);

  const verses = await res.json();
  if (!Array.isArray(verses) || verses.length === 0) throw new Error('No verses found.');

  const filtered = startVerse !== null
    ? verses.filter(v => v.verse >= startVerse && v.verse <= endVerse)
    : verses;

  if (filtered.length === 0) throw new Error('Verse range not found.');

  const text = filtered.map(v => `[${v.verse}] ${v.text}`).join(' ');
  const bookNameNormalized = DA_CONSTANTS.FULL_BOOK_NAMES[bookName] || match[1].trim();
  const ref = `${bookNameNormalized} ${chapter}${startVerse ? ':' + startVerse + (endVerse !== startVerse ? '-' + endVerse : '') : ''}`;

  return { text, passageRef: ref, copyright: `(${translation})` };
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function parsePassageReference(query) {
  const match = query.match(PASSAGE_REF_REGEX);
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

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Fetch a Bible passage from the best available source.
 *
 * Source priority:
 *   Greek NT  — Logos (NA28) → SBLGNT
 *   Greek OT  — Bolls LXX
 *   ESV       — Logos → Bolls ESV
 *   NASB      — Logos → Bolls NASB
 *
 * @param {string} version - 'esv' | 'nasb' | 'greek'
 * @param {string} query   - Passage reference e.g. "John 1:1-5"
 */
async function fetchPassageData(version, query) {
  if (version === 'greek') {
    const ref = parsePassageReference(query);
    if (ref && ref.file) {
      const logos = await fetchFromLogos('na28', query);
      if (logos) return { ...logos, isGreek: true };
      const result = await fetchSBLGNTPassage(query, ref);
      return { ...result, isGreek: true };
    } else {
      const data = await fetchFromBolls('LXX', query);
      const parsed = parseBollsText(data.text);
      return { ...parsed, passageRef: data.passageRef, copyright: data.copyright, isGreek: true };
    }
  }

  const logos = await fetchFromLogos(version, query);
  if (logos) {
    const parsed = parseBollsText(logos.text);
    return { ...parsed, passageRef: logos.passageRef, copyright: logos.copyright, isGreek: false };
  }

  const translation = version === 'nasb' ? 'NASB' : 'ESV';
  const data = await fetchFromBolls(translation, query);
  const parsed = parseBollsText(data.text);
  return { ...parsed, passageRef: data.passageRef, copyright: data.copyright, isGreek: false };
}

window.DA_BIBLE = {
  fetchPassageData
};
