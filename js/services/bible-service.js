/**
 * Main entry point for fetching a passage.
 * @param {string} version - 'esv', 'nasb', or 'greek'
 * @param {string} query - Reference string (e.g. "John 1:1")
 * @param {string} apiKey - Optional ESV API key
 * @returns {Promise<{propositions: string[], verseRefs: string[], passageRef: string, copyright: string, isGreek: boolean}>}
 */
async function fetchPassageData(version, query, apiKey) {
  if (version === 'greek') {
    const ref = parsePassageReference(query);
    if (ref && ref.file) {
      // New Testament -> SBLGNT
      const result = await fetchSBLGNTPassage(query);
      return { ...result, isGreek: true };
    } else {
      // Old Testament -> LXX via Bolls
      const data = await fetchFromBolls('LXX', query);
      const parsed = parseBollsText(data.text);
      return { 
        propositions: parsed.propositions, 
        verseRefs: parsed.verseRefs, 
        passageRef: data.passageRef, 
        copyright: data.copyright, 
        isGreek: true 
      };
    }
  }

  // English versions
  let data = null;
  let error = null;

  // 1. ESV API
  if (version === 'esv' && apiKey) {
    try {
      const url = new URL(DA_CONSTANTS.ESV_API);
      url.searchParams.set('q', query);
      url.searchParams.set('include-passage-references', 'false');
      url.searchParams.set('include-verse-numbers', 'true');
      url.searchParams.set('include-footnotes', 'false');
      url.searchParams.set('include-headings', 'false');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Token ${apiKey}` },
      });
      if (res.ok) {
        const raw = await res.json();
        data = {
          text: (raw.passages?.[0] || '').replace(/\s*\(ESV\)\s*$/i, '').trim(),
          passageRef: raw.canonical || query,
          copyright: '(ESV)'
        };
      } else {
        error = `ESV API Error: ${res.status}`;
      }
    } catch (err) {
      error = err.message;
    }
  }

  // 2. Fallback to Bolls
  if (!data) {
    let bollsTranslation = version === 'nasb' ? 'NASB' : 'ESV';
    try {
      data = await fetchFromBolls(bollsTranslation, query);
    } catch (err) {
      throw new Error(error ? `${error} -> Fallback failed: ${err.message}` : err.message);
    }
  }

  const parsed = parseBollsText(data.text);
  return {
    propositions: parsed.propositions,
    verseRefs: parsed.verseRefs,
    passageRef: data.passageRef,
    copyright: data.copyright,
    isGreek: false
  };
}

function parsePassageReference(query) {
  const regex = /^(\d?\s*[a-zA-Z\s]+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/;
  const match = query.match(regex);
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

async function fetchSBLGNTPassage(query) {
  const ref = parsePassageReference(query);
  if (!ref || !ref.file) throw new Error('Book not found in SBLGNT (New Testament only).');

  const url = `${DA_CONSTANTS.SBLGNT_BASE}${ref.file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SBLGNT fetch error: ${res.status}`);

  const text = await res.text();
  const lines = text.split('\n');
  const results = [];
  const verseRefs = [];

  const chapterStr = String(ref.chapter).padStart(2, '0');

  for (let line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const loc = parts[0].trim(); // e.g. "Eph 1:1"
    const m = loc.match(/(\d+):(\d+)$/);
    if (!m) continue;

    const curChapter = parseInt(m[1]);
    const curVerse = parseInt(m[2]);

    const isInRange = ref.hasVerses 
      ? (curVerse >= ref.startVerse && curVerse <= ref.endVerse)
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
    verseRefs: verseRefs,
    passageRef: `${ref.bookName} ${ref.chapter}${ref.hasVerses ? ':' + ref.startVerse + (ref.endVerse !== ref.startVerse ? '-' + ref.endVerse : '') : ''}`,
    copyright: '(SBLGNT)'
  };
}

async function fetchFromBolls(translation, query) {
  const regex = /^(\d?\s*[a-zA-Z\s]+?)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/;
  const match = query.match(regex);
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

  const filtered = (startVerse !== null)
    ? verses.filter(v => v.verse >= startVerse && v.verse <= endVerse)
    : verses;

  if (filtered.length === 0) throw new Error('Verse range not found.');

  const text = filtered.map(v => `[${v.verse}] ${v.text}`).join(' ');
  const bookNameNormalized = DA_CONSTANTS.FULL_BOOK_NAMES[bookName] || match[1].trim();
  const ref = `${bookNameNormalized} ${chapter}${startVerse ? ':' + startVerse + (endVerse !== startVerse ? '-' + endVerse : '') : ''}`;

  return { text, passageRef: ref, copyright: `(${translation})` };
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

window.DA_BIBLE = {
    fetchPassageData
};
