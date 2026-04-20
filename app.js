/**
 * Bible Bracket — Proposition bracketing tool with ESV API and SBL Greek NT integration
 * Fetches passages, splits into propositions, draws logic brackets between them.
 */

const ESV_API = 'https://api.esv.org/v3/passage/text/';
const SBLGNT_BASE = 'https://raw.githubusercontent.com/Faithlife/SBLGNT/master/data/sblgnt/text/';

// SBLGNT book name → file name (Faithlife repo)
const SBLGNT_BOOKS = {
  matt: 'Matt.txt', matthew: 'Matt.txt', mt: 'Matt.txt',
  mark: 'Mark.txt', mk: 'Mark.txt', mr: 'Mark.txt',
  luke: 'Luke.txt', lk: 'Luke.txt',
  john: 'John.txt', jn: 'John.txt', jhn: 'John.txt', joh: 'John.txt',
  acts: 'Acts.txt', ac: 'Acts.txt',
  rom: 'Rom.txt', romans: 'Rom.txt', ro: 'Rom.txt',
  '1cor': '1Cor.txt', '1 cor': '1Cor.txt', '1 corinthians': '1Cor.txt', '1corinthians': '1Cor.txt',
  '2cor': '2Cor.txt', '2 cor': '2Cor.txt', '2 corinthians': '2Cor.txt', '2corinthians': '2Cor.txt',
  gal: 'Gal.txt', galatians: 'Gal.txt', ga: 'Gal.txt',
  eph: 'Eph.txt', ephesians: 'Eph.txt',
  phil: 'Phil.txt', philippians: 'Phil.txt', php: 'Phil.txt',
  col: 'Col.txt', colossians: 'Col.txt',
  '1thess': '1Thess.txt', '1 thess': '1Thess.txt', '1 thessalonians': '1Thess.txt',
  '2thess': '2Thess.txt', '2 thess': '2Thess.txt', '2 thessalonians': '2Thess.txt',
  '1tim': '1Tim.txt', '1 tim': '1Tim.txt', '1 timothy': '1Tim.txt',
  '2tim': '2Tim.txt', '2 tim': '2Tim.txt', '2 timothy': '2Tim.txt',
  titus: 'Titus.txt', tit: 'Titus.txt',
  phlm: 'Phlm.txt', philemon: 'Phlm.txt',
  heb: 'Heb.txt', hebrews: 'Heb.txt',
  jas: 'Jas.txt', james: 'Jas.txt',
  '1pet': '1Pet.txt', '1 pet': '1Pet.txt', '1 peter': '1Pet.txt',
  '2pet': '2Pet.txt', '2 pet': '2Pet.txt', '2 peter': '2Pet.txt',
  '1jn': '1John.txt', '1 john': '1John.txt', '1john': '1John.txt',
  '2jn': '2John.txt', '2 john': '2John.txt', '2john': '2John.txt',
  '3jn': '3John.txt', '3 john': '3John.txt', '3john': '3John.txt',
  jude: 'Jude.txt', jud: 'Jude.txt',
  rev: 'Rev.txt', revelation: 'Rev.txt', re: 'Rev.txt',
};

// State
let passageRef = '';
let propositions = [];
let verseRefs = []; // e.g. ['1', '2', '18a', '18b']
let brackets = [];
let bracketSelectStep = 0;
let bracketFrom = null; // { type: 'single', index } or { type: 'range', from, to }
let connectBracketToBracketIdx = null; // when set, next proposition click is the reparent target
let _connectCancelListener = null;
let undoStack = []; // { action: 'divide'|'bracket', propositions, verseRefs, brackets } snapshots
let comments = []; // { id, type: 'bracket'|'text', target: { bracketIdx }|{ propIndex, start, end }, text, author?, createdAt, replies?: { id, text, author?, createdAt }[] }
let isRenderingPropositions = false; // true during renderPropositions so focusout doesn't overwrite (Electron)
let commentMode = false;
let textEditMode = false;
let formatTags = []; // { type: 'bold'|'underline', propIndex, start, end }
let arrowMode = false;
let wordArrows = [];
let selectedArrowIdx = null; // { fromProp, fromStart, fromEnd, toProp, toStart, toEnd }
let pendingArrowStart = null; // { propIndex, start, end }
let arrowHighlight = null; // DOM element for hovering word overlay

// DOM
const passageInput = document.getElementById('passageInput');
const fetchBtn = document.getElementById('fetchBtn');
const apiKeyInput = document.getElementById('apiKey');
const passageRefEl = document.getElementById('passageRef');
const passageHeader = passageRefEl;

const pasteText = document.getElementById('pasteText');
const importBtn = document.getElementById('importBtn');
const importPassageRef = document.getElementById('importPassageRef');
const importStartVerse = document.getElementById('importStartVerse');

const saveBtn = document.getElementById('saveBtn');
const saveAsBtn = document.getElementById('saveAsBtn');
const openFileBtn = document.getElementById('openFileBtn');
const importFileInput = document.getElementById('importFileInput');

const copyForWordBtn = document.getElementById('copyForWordBtn');
const copyDataBtn = document.getElementById('copyDataBtn');

const newBracketBtn = document.getElementById('newBracketBtn');
const propositionEditor = document.getElementById('propositionEditor');
const propositionsContainer = document.getElementById('propositions');
const bracketCanvas = document.getElementById('bracketCanvas');
if (bracketCanvas) {
  bracketCanvas.addEventListener('click', (e) => {
    if (e.target === bracketCanvas) {
      if (selectedArrowIdx !== null) {
        selectedArrowIdx = null;
        renderPropositions();
        renderBrackets();
      }
    }
  });
}
const clearBracketsBtn = document.getElementById('clearBrackets');

if (passageRefEl) {
  const syncPassageRef = () => {
    const val = (passageRefEl.textContent || '').trim();
    passageRef = val || passageRef || '—';
    if (!val) passageRefEl.textContent = passageRef;
  };
  passageRefEl.addEventListener('blur', syncPassageRef);
  passageRefEl.addEventListener('input', syncPassageRef);
}

// Load API key from localStorage
if (apiKeyInput) {
  const defaultEsvKey = 'Token c8ccaec8888bfa568c00c545383a7cd28b056af3';
  apiKeyInput.value = localStorage.getItem('biblebracket_esv_api_key') || defaultEsvKey;
  apiKeyInput.addEventListener('change', () => {
    localStorage.setItem('biblebracket_esv_api_key', apiKeyInput.value);
  });
}

// Version selector: show/hide API key row for SBLGNT (no key needed)
const versionSelect = document.getElementById('versionSelect');
const apiKeyRow = document.getElementById('apiKeyRow');
function updateApiKeyVisibility() {
  if (apiKeyRow) {
    apiKeyRow.style.display = 'none';
  }
}
if (versionSelect) {
  versionSelect.addEventListener('change', updateApiKeyVisibility);
  updateApiKeyVisibility();
}

// Theme toggle (light/dark)
const THEME_KEY = 'biblebracket_theme';
const COMMENT_AUTHOR_KEY = 'biblebracket_comment_author';
const PAGE_AUTHOR_KEY = 'biblebracket_page_author';
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
}
function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  html.setAttribute('data-theme', isLight ? '' : 'light');
  localStorage.setItem(THEME_KEY, isLight ? 'dark' : 'light');
}
initTheme();
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

// Page/bracket author (persisted in localStorage, included in saved/exported bracket, shown top-right in workspace for export/copy)
const pageAuthorInput = document.getElementById('pageAuthor');
const passageAuthorEl = document.getElementById('passageAuthor');
function syncPassageAuthorDisplay() {
  if (passageAuthorEl) {
    const name = (pageAuthorInput?.value || '').trim() || (typeof localStorage !== 'undefined' ? localStorage.getItem(PAGE_AUTHOR_KEY) : '') || '';
    passageAuthorEl.textContent = name;
  }
}
if (pageAuthorInput) {
  pageAuthorInput.value = localStorage.getItem(PAGE_AUTHOR_KEY) || '';
  syncPassageAuthorDisplay();
  pageAuthorInput.addEventListener('change', () => {
    try { localStorage.setItem(PAGE_AUTHOR_KEY, pageAuthorInput.value.trim()); } catch (_) {}
    syncPassageAuthorDisplay();
  });
  pageAuthorInput.addEventListener('blur', () => {
    try { localStorage.setItem(PAGE_AUTHOR_KEY, pageAuthorInput.value.trim()); } catch (_) {}
    syncPassageAuthorDisplay();
  });
}

// 18 Logical Relationships (BibleBracket) - type key -> display label
const RELATIONSHIP_TYPES = {
  series: 'Series (S)',
  progression: 'Progression (P)',
  alternative: 'Alternative (A)',
  ground: 'Ground (G)',
  inference: 'Inference (I)',
  bilateral: 'Bilateral (BL)',
  'cause-effect': 'Cause-Effect (C/E)',
  'action-result': 'Cause-Effect (C/E)', // legacy alias
  'action-purpose': 'Action-Purpose (Ac/Pur)',
  conditional: 'Conditional (If/Th)',
  temporal: 'Temporal (T)',
  locative: 'Locative (L)',
  'action-manner': 'Action-Manner (Ac/Mn)',
  comparison: 'Comparison (Cf)',
  'negative-positive': 'Negative-Positive (-/+)',
  'idea-explanation': 'Idea-Explanation (Id/Exp)',
  'question-answer': 'Question-Answer (Q/A)',
  concessive: 'Concessive (Csv)',
  'situation-response': 'Situation-Response (Sit/R)',
};

// Series, Alternative, Bilateral, and unspecified get a single center label; all others get two (one per end)
const SINGLE_LABEL_TYPES = new Set(['series', 'alternative', 'bilateral', 'unspecified']);

const undoDivideBtn = document.getElementById('undoDivideBtn');
if (undoDivideBtn) undoDivideBtn.addEventListener('click', undoLastAction);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undoLastAction();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveBracket();
  }

  if (e.key === 'Escape') {
    // 1. Cancel in-progress bracket or arrow creation
    if (bracketSelectStep === 1) {
      bracketSelectStep = 0;
      bracketFrom = null;
      clearPropositionHighlights();
      bracketCanvas?.classList.remove('connect-mode');
      showStatus('Bracket selection cancelled.', 'info');
      return;
    }
    if (arrowMode && (typeof pendingArrowStart !== 'undefined' && pendingArrowStart !== null)) {
      pendingArrowStart = null;
      showStatus('Arrow selection cancelled.', 'info');
      return;
    }

    // 2. Dismiss any active popovers
    const labelPicker = document.getElementById('labelPicker');
    const bracketActions = document.getElementById('bracketActions');
    if (labelPicker || bracketActions) {
      if (labelPicker) labelPicker.remove();
      if (bracketActions) {
        bracketActions.remove();
        clearPropositionHighlights();
      }
      return;
    }

    // 3. Exit active modes (Text Edit, Arrow, or Comment)
    if (textEditMode) {
      textEditModeBtn?.click();
      return;
    }
    if (arrowMode) {
      arrowModeBtn?.click();
      return;
    }
    if (commentMode) {
      commentModeBtn?.click();
      return;
    }

    if (selectedArrowIdx !== null) {
      selectedArrowIdx = null;
      renderPropositions();
      renderBrackets();
      return;
    }
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    // Only delete if we are not in an input field
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    
    if (selectedArrowIdx !== null && selectedArrowIdx < wordArrows.length) {
      undoStack.push({ action: 'delete arrow', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map(a => ({...a})), formatTags: formatTags.map(f => ({...f})), wordArrows: wordArrows.map(w => ({...w})) });
      wordArrows.splice(selectedArrowIdx, 1);
      selectedArrowIdx = null;
      renderPropositions();
      renderBrackets();
      showStatus('Arrow removed.', 'success');
    }
  }
}, true);

function formatBracketType(type) {
  return RELATIONSHIP_TYPES[type] || type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
}

// Parse passage reference for SBLGNT: "John 1:1-5" → { book, chapter, verseStart, verseEnd }
function parsePassageReference(query) {
  const m = query.match(/^\s*([\w\s]+?)\s*(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?\s*$/i);
  if (!m) return null;
  const bookRaw = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
  const bookKey = bookRaw.replace(/\s+/g, '');
  const file = SBLGNT_BOOKS[bookKey] || SBLGNT_BOOKS[bookRaw];
  if (!file) return null;
  const chapter = parseInt(m[2], 10);
  const verseStart = parseInt(m[3], 10);
  const verseEnd = m[4] ? parseInt(m[4], 10) : verseStart;
  return { file, chapter, verseStart, verseEnd, bookRaw };
}

// Fetch passage from SBLGNT (Faithlife plain text)
async function fetchSBLGNTPassage(query) {
  const ref = parsePassageReference(query);
  if (!ref) {
    throw new Error('Invalid reference. Use format like John 1:1-5 or Romans 8:28.');
  }

  const url = SBLGNT_BASE + ref.file;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch SBLGNT: ${res.status}`);
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const propositions = [];
  const verseRefs = [];

  // Match lines like "John 1:1 Ἐν ἀρχῇ..." or "1John 1:1 Ὃ ἦν..."
  const verseRe = /\s(\d+)\s*:\s*(\d+)\s+(.*)$/;

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(verseRe);
    if (!m) continue;
    const ch = parseInt(m[1], 10);
    const v = parseInt(m[2], 10);
    const content = m[3].trim();
    if (ch === ref.chapter && v >= ref.verseStart && v <= ref.verseEnd && content) {
      propositions.push(content);
      verseRefs.push(String(v));
    }
  }

  if (propositions.length === 0) {
    throw new Error(`No verses found for ${query}. Check book, chapter, and verse range.`);
  }

  const bookName = ref.bookRaw.replace(/\b\w/g, c => c.toUpperCase());
  const canon = `${bookName} ${ref.chapter}:${ref.verseStart}` +
    (ref.verseEnd > ref.verseStart ? `-${ref.verseEnd}` : '');

  return { propositions, verseRefs, passageRef: canon };
}

// Fetch passage (ESV or SBLGNT based on version selector)
async function fetchPassage() {
  const versionSelect = document.getElementById('versionSelect');
  const copyrightLabel = document.getElementById('copyrightLabel');
  const apiKeyRow = document.getElementById('apiKeyRow');
  const version = versionSelect?.value || 'esv';
  const query = passageInput?.value?.trim() || '';

  if (!query) {
    showStatus('Enter a passage reference (e.g. John 1:1-5)', 'error');
    return;
  }

  if (version === 'esv') {
    const key = apiKeyInput?.value?.trim() || '';
    if (!key) {
      showStatus('Enter your ESV API key. Get one free at api.esv.org', 'error');
      return;
    }
  }

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching…';

  try {
    if (version === 'sblgnt') {
      const result = await fetchSBLGNTPassage(query);
      propositions = result.propositions;
      verseRefs = result.verseRefs;
      passageRef = result.passageRef;
      if (copyrightLabel) copyrightLabel.textContent = '(SBLGNT)';
      if (propositionsContainer) propositionsContainer.classList.add('greek-text');
    } else {
      const key = apiKeyInput.value.trim();
      const url = new URL(ESV_API);
      url.searchParams.set('q', query);
      url.searchParams.set('include-passage-references', 'false');
      url.searchParams.set('include-verse-numbers', 'true');
      url.searchParams.set('include-footnotes', 'false');
      url.searchParams.set('include-headings', 'false');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Token ${key}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `API error: ${res.status}`);
      }

      const data = await res.json();
      const text = (data.passages?.[0] || '')
        .replace(/\s*\(ESV\)\s*$/i, '')
        .trim();

      passageRef = data.canonical || query;

      const verseParts = text.split(/(?=\[\d+\])/);
      propositions = [];
      verseRefs = [];
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
      if (propositions.length === 0) {
        propositions = [text.replace(/\[\d+\]\s*/g, '').trim()];
        verseRefs = ['1'];
      }

      if (copyrightLabel) copyrightLabel.textContent = '(ESV)';
      if (propositionsContainer) propositionsContainer.classList.remove('greek-text');
    }

    if (passageHeader) passageHeader.textContent = passageRef;
    undoStack = [];
    renderPropositions();
    brackets = [];
    renderBrackets();
  } catch (err) {
    showStatus(err.message || 'Failed to fetch passage', 'error');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch Passage';
  }
}

function showStatus(message, type) {
  const existing = document.querySelector('.status');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `status ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// Save/restore scroll to prevent jump when re-rendering (split, etc.)
function saveScrollState() {
  const state = { x: window.scrollX, y: window.scrollY, scrollables: [] };
  let el = propositionsContainer;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight) {
      state.scrollables.push({ el, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop });
    }
    el = el.parentElement;
  }
  return state;
}
function restoreScrollState(state) {
  if (!state) return;
  window.scrollTo(state.x, state.y);
  (state.scrollables || []).forEach(({ el, scrollLeft, scrollTop }) => {
    if (el && el.scrollTo) { el.scrollLeft = scrollLeft; el.scrollTop = scrollTop; }
  });
}

// Render propositions as editable blocks
function renderPropositions() {
  if (propositions.length === 0) {
    propositionsContainer.innerHTML = '';
    const ta = document.createElement('textarea');
    ta.id = 'propositionEditor';
    ta.placeholder = 'Fetch or import a passage, then use Divide mode to click and split the text.';
    ta.className = 'proposition-editor';
    propositionsContainer.appendChild(ta);
    bracketCanvas.innerHTML = '';
    return;
  }

  isRenderingPropositions = true;
  const scrollState = saveScrollState();
  propositionsContainer.innerHTML = '';

  while (verseRefs.length < propositions.length) verseRefs.push(String(verseRefs.length + 1));
  if (verseRefs.length > propositions.length) verseRefs.length = propositions.length;

  propositions.forEach((text, i) => {
    const block = document.createElement('div');
    block.className = 'proposition-block';
    block.dataset.index = i;
    const ref = verseRefs[i];
    const refSpan = document.createElement('span');
    refSpan.className = 'verse-ref';
    refSpan.textContent = ref ? `${ref} ` : '';
    refSpan.contentEditable = 'false';
    const textSpan = document.createElement('span');
    textSpan.className = 'proposition-text';
    textSpan.contentEditable = 'true';
    textSpan.spellcheck = false;
    const textComments = comments.filter((c) => c.type === 'text' && c.target && c.target.propIndex === i);
    const textFormats = formatTags.filter((f) => f.propIndex === i);
    const textArrows = [];
    wordArrows.forEach((wa, idx) => {
      if (wa.fromProp === i) textArrows.push({ start: wa.fromStart, end: wa.fromEnd, type: 'arrow-anchor', id: `arrow-${idx}-from` });
      if (wa.toProp === i) textArrows.push({ start: wa.toStart, end: wa.toEnd, type: 'arrow-anchor', id: `arrow-${idx}-to` });
    });

    if (textComments.length === 0 && textFormats.length === 0 && textArrows.length === 0) {
      textSpan.textContent = text;
    } else {
      const allTags = [];
      textComments.forEach(c => allTags.push({ ...c.target, type: 'comment', tag: c }));
      textFormats.forEach(f => allTags.push({ ...f, tag: f }));
      textArrows.forEach(a => allTags.push({ ...a, tag: a }));

      let events = [];
      allTags.forEach((t, tid) => {
        events.push({ pos: Math.max(0, t.start), type: 'start', tid });
        events.push({ pos: Math.min(text.length, t.end), type: 'end', tid });
      });
      events.sort((a, b) => a.pos === b.pos ? (a.type === b.type ? 0 : (a.type === 'start' ? 1 : -1)) : a.pos - b.pos);

      let pos = 0;
      let activeTags = new Set();

      events.forEach(e => {
        if (e.pos > pos) {
          const chunk = text.slice(pos, e.pos);
          let node = document.createTextNode(chunk);
          let wrapper = null;
          let currentInner = null;

          const activeIds = Array.from(activeTags);
          activeIds.forEach(id => {
            const t = allTags[id];
            if (t.type === 'bold' || t.type === 'underline') {
              const el = document.createElement(t.type === 'underline' ? 'u' : 'b');
              if (!wrapper) wrapper = currentInner = el;
              else { currentInner.appendChild(el); currentInner = el; }
            }
          });

          activeIds.forEach(id => {
            const t = allTags[id];
            if (t.type === 'comment') {
              const mark = document.createElement('mark');
              mark.className = 'comment-highlight';
              mark.dataset.commentId = t.tag.id;
              mark.addEventListener('mouseenter', () => {
                const card = document.querySelector(`.comments-preview-card[data-comment-id="${t.tag.id}"]`);
                if (card) {
                  card.classList.add('comment-hover-active');
                  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
              });
              mark.addEventListener('mouseleave', () => {
                document.querySelectorAll('.comments-preview-card.comment-hover-active').forEach(c => c.classList.remove('comment-hover-active'));
              });
              if (!wrapper) wrapper = currentInner = mark;
              else { currentInner.appendChild(mark); currentInner = mark; }
            }
          });

          activeIds.forEach(id => {
            const t = allTags[id];
            if (t.type === 'arrow-anchor') {
              const span = document.createElement('span');
              span.className = 'arrow-anchor';
              span.dataset.arrowId = t.tag.id;
              if (!wrapper) wrapper = currentInner = span;
              else { currentInner.appendChild(span); currentInner = span; }
            }
          });

          if (currentInner) {
            currentInner.appendChild(node);
            textSpan.appendChild(wrapper);
          } else {
            textSpan.appendChild(node);
          }
          pos = e.pos;
        }
        if (e.type === 'start') activeTags.add(e.tid);
        else activeTags.delete(e.tid);
      });

      if (pos < text.length) textSpan.appendChild(document.createTextNode(text.slice(pos)));
    }
    block.appendChild(refSpan);
    block.appendChild(textSpan);

    let textBeforeEdit = null;
    block.addEventListener('focusin', () => {
      textBeforeEdit = propositions[i];
    });

    block.addEventListener('input', () => {
      updateBracketPositions();
    });

    block.addEventListener('focusout', () => {
      if (isRenderingPropositions || !block.isConnected || !propositionsContainer?.contains(block)) return; // Don't overwrite during re-render (Electron) or when block was removed

      let extractedText = '';
      let newFormatTags = [];
      const textSpanEl = block.querySelector('.proposition-text');
      if (textSpanEl) {
        function traverse(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            extractedText += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'BR') extractedText += '\n';
            else if (node.tagName === 'DIV' && extractedText.length > 0 && !extractedText.endsWith('\n')) extractedText += '\n';

            let start = extractedText.length;
            node.childNodes.forEach(traverse);
            let end = extractedText.length;

            if (start < end) {
              let type = null;
              if (node.tagName === 'B' || node.tagName === 'STRONG') type = 'bold';
              else if (node.tagName === 'U') type = 'underline';
              if (type) newFormatTags.push({ type, propIndex: i, start, end });
            }
          }
        }
        textSpanEl.childNodes.forEach(traverse);
      }

      let currentText = extractedText;
      if (textEditMode) {
        currentText = currentText.replace(/\n$/, '') || '(empty)';
      } else {
        const trimmed = currentText.trimStart();
        const diff = currentText.length - trimmed.length;
        currentText = trimmed.trim() || '(empty)';
        if (diff > 0) {
          newFormatTags.forEach(f => {
            f.start = Math.max(0, f.start - diff);
            f.end = Math.max(0, f.end - diff);
          });
        }
      }

      if (textBeforeEdit !== null && currentText !== textBeforeEdit) {
        undoStack.push({ action: 'text edit', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });
      }
      propositions[i] = currentText;
      formatTags = formatTags.filter(f => f.propIndex !== i).concat(newFormatTags);
    });

    block.addEventListener('keydown', (e) => {
      if (textEditMode) {
        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand('insertText', false, '\t');
        }
        return; // Allow other keys to be natively edited
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'u')) {
        e.preventDefault();
        document.execCommand(e.key === 'b' ? 'bold' : 'underline');
        return;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const textSpan = block.querySelector('.proposition-text') ?? block;
        const currentText = (textSpan.textContent ?? '').trim() || '(empty)';
        const sel = window.getSelection();
        let offset = null;
        if (sel?.rangeCount) {
          const r = sel.getRangeAt(0);
          if (block.contains(r.startContainer)) {
            try {
              const measureRange = document.createRange();
              measureRange.setStart(textSpan, 0);
              measureRange.setEnd(r.startContainer, r.startOffset);
              offset = measureRange.toString().length;
            } catch (_) {}
          }
        }
        if (offset != null && offset > 0 && offset < currentText.length) {
          propositions[i] = currentText;
          splitPropositionAtOffset(i, offset);
        }
      }
    }, true);

    block.addEventListener('click', (e) => {
      e.stopPropagation();
      if (textEditMode) return; // Allow normal text selection
      const clickedText = e.target.closest('.proposition-text');
      if (commentMode && clickedText) return; // Comment mode: allow text selection only
      let idx;
      if (connectBracketToBracketIdx !== null) {
        idx = getPropositionIndexAtPoint(e.clientX, e.clientY);
        if (idx < 0) idx = parseInt(block.dataset.index, 10);
      } else {
        idx = parseInt(block.dataset.index, 10);
      }
      const inBracketFlow = bracketSelectStep === 1 || connectBracketToBracketIdx !== null;
      if (inBracketFlow || !clickedText) {
        handlePropositionClick(idx);
      }
    });

    propositionsContainer.appendChild(block);
  });

  updateBracketPositions();
  // Restore scroll after layout (and ResizeObserver-triggered renderBrackets) to prevent jump
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      restoreScrollState(scrollState);
      isRenderingPropositions = false;
    });
  });
}

// Resolve proposition index at viewport coordinates (for Connect-to mode; avoids bracket overlay / boundary issues)
function getPropositionIndexAtPoint(clientX, clientY) {
  const blocks = propositionsContainer?.querySelectorAll('.proposition-block');
  if (!blocks?.length) return -1;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < blocks.length; i++) {
    const r = blocks[i].getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return parseInt(blocks[i].dataset.index, 10);
    }
    const midY = r.top + r.height / 2;
    const dist = Math.abs(clientY - midY);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best >= 0 ? parseInt(blocks[best].dataset.index, 10) : -1;
}

function findBracketContainingProposition(index) {
  const candidates = brackets
    .map((bracket, idx) => ({ bracket, idx }))
    .filter(({ bracket }) => bracket.from <= index && index <= bracket.to && bracket.from !== bracket.to);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.bracket.to - a.bracket.from) - (b.bracket.to - b.bracket.from));
  return candidates[0].idx;
}

// Reparent a bracket so it is "connected to" target proposition; refactors containing brackets so slots update.
function reparentBracketToProposition(bracketIdx, targetIndex) {
  if (bracketIdx < 0 || bracketIdx >= brackets.length) return;
  const bracket = brackets[bracketIdx];
  const from = bracket.from;
  const to = bracket.to;
  const P = targetIndex;

  if (P >= from && P <= to) {
    showStatus('Choose a proposition outside this bracket to connect to.', 'error');
    return;
  }

  undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });

  // Shrink any bracket that contains [from, to] (spans past at least one end) so it no longer contains it (cut at P).
  brackets.forEach((a, i) => {
    if (i === bracketIdx) return;
    const contains = a.from <= from && a.to >= to && (a.from < from || a.to > to);
    if (!contains) return;
    if (P < from) {
      a.to = P;
    } else {
      a.from = P;
    }
  });

  // Remove the bracket we're reparenting (replace it with the new span).
  brackets.splice(bracketIdx, 1);

  // Remove brackets that became invalid (from >= to).
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (brackets[i].from >= brackets[i].to) brackets.splice(i, 1);
  }

  // Add a new bracket that spans from P to this bracket, so the bracket becomes a direct child of P.
  const newFrom = Math.min(P, from);
  const newTo = Math.max(P, to);
  brackets.push({ from: newFrom, to: newTo, type: bracket.type, labelsSwapped: bracket.labelsSwapped ?? false });

  renderBrackets();
  showStatus('Bracket connected. Nesting and slots updated.', 'success');
}

function handlePropositionClick(index) {
  if (connectBracketToBracketIdx !== null) {
    reparentBracketToProposition(connectBracketToBracketIdx, index);
    connectBracketToBracketIdx = null;
    bracketCanvas?.classList.remove('connect-mode');
    if (_connectCancelListener) {
      document.removeEventListener('click', _connectCancelListener);
      _connectCancelListener = null;
    }
    document.getElementById('bracketActions')?.remove();
    clearPropositionHighlights();
    return;
  }

  if (bracketSelectStep === 0) {
    const bracketIdx = findBracketContainingProposition(index);
    if (bracketIdx !== null) {
      const bracket = brackets[bracketIdx];
      highlightPropositionRange(bracket.from, bracket.to, true);
      const blocks = propositionsContainer.querySelectorAll('.proposition-block');
      const rFrom = blocks[bracket.from]?.getBoundingClientRect?.();
      const rTo = blocks[bracket.to]?.getBoundingClientRect?.();
      const wr = propositionsContainer.parentElement?.getBoundingClientRect();
      const centerY = rFrom && rTo && wr ? ((rFrom.top + rFrom.bottom + rTo.top + rTo.bottom) / 4 - wr.top) : 0;
      const centerX = propositionsContainer.parentElement ? propositionsContainer.parentElement.offsetWidth / 2 : 0;
      showBracketActions(bracketIdx, centerY, centerX);
      return;
    }
  }

  const sel = { type: 'single', from: index, to: index };

  if (bracketSelectStep === 0) {
    bracketFrom = sel;
    bracketSelectStep = 1;
    highlightPropositionRange(sel.from, sel.to, true);
    showStatus('Now click the second proposition or bracket group.', 'success');
  } else if (bracketSelectStep === 1) {
    const fromStart = bracketFrom.from;
    const fromEnd = bracketFrom.to;
    if (index >= fromStart && index <= fromEnd) {
      bracketCanvas?.classList.remove('connect-mode');
      bracketSelectStep = 0;
      bracketFrom = null;
      clearPropositionHighlights();
      showStatus('Bracket cancelled. Select a different first item.', 'error');
      return;
    }
    // Bracket first then proposition (or proposition first then bracket): create a new bracket spanning both
    const toStart = Math.min(fromStart, index);
    const toEnd = Math.max(fromEnd, index);
    showRelationshipPicker(toStart, toEnd);
  }
}

function handleBracketGroupClick(bracketIdx) {
  const bracket = brackets[bracketIdx];
  const sel = { type: 'range', from: bracket.from, to: bracket.to, bracketIdx };

  if (bracketSelectStep === 0) {
    bracketFrom = sel;
    bracketSelectStep = 1;
    highlightPropositionRange(sel.from, sel.to, true);
    bracketCanvas?.classList.add('connect-mode');
    showStatus('Click a proposition to connect to, or another bracket to create a bracket.', 'success');
  } else if (bracketSelectStep === 1) {
    const fromStart = bracketFrom.from;
    const fromEnd = bracketFrom.to;
    if (bracket.from >= fromStart && bracket.to <= fromEnd) {
      bracketCanvas?.classList.remove('connect-mode');
      bracketSelectStep = 0;
      bracketFrom = null;
      clearPropositionHighlights();
      showStatus('Bracket cancelled. Select a different first item.', 'error');
      return;
    }
    const toStart = Math.min(fromStart, bracket.from);
    const toEnd = Math.max(fromEnd, bracket.to);
    showRelationshipPicker(toStart, toEnd);
  }
}

function showRelationshipPicker(from, to) {
  bracketCanvas?.classList.remove('connect-mode');
  clearPropositionHighlights();
  bracketSelectStep = 0;
  bracketFrom = null;
  // Add unlabelled bracket (dashed + ?); user clicks the bracket to choose relationship
  undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });
  brackets = brackets.map(a => {
    // Only expand brackets that truly cross (not merely adjacent at a shared endpoint)
    const trulyCrosses = a.from < to && a.to > from && a.to !== from && a.from !== to;
    const isEnclosingOrEnclosed = (a.from <= from && a.to >= to) || (from <= a.from && to >= a.to);
    if (trulyCrosses && !isEnclosingOrEnclosed) {
      return { ...a, from: Math.min(a.from, from), to: Math.max(a.to, to) };
    }
    return a;
  });

  brackets.push({ from, to, type: 'unspecified', labelsSwapped: false });
  renderBrackets();

  const bracketIdx = brackets.length - 1;
  const blocks = propositionsContainer.querySelectorAll('.proposition-block');
  const rFrom = blocks[from]?.getBoundingClientRect();
  const rTo = blocks[to]?.getBoundingClientRect();
  const wr = propositionsContainer.parentElement?.getBoundingClientRect();
  // Position it below the bottom edge of the bracket range
  const centerY = rTo && wr ? (rTo.bottom - wr.top + 130) : 130;
  // Biased to the left to avoid covering the text area
  const centerX = 220;

  showLabelPicker(bracketIdx, centerY, centerX);
  showStatus('Bracket added. Choose a relationship label.', 'success');
}

function highlightPropositionRange(from, to, on) {
  for (let i = from; i <= to; i++) {
    const block = propositionsContainer.querySelector(`[data-index="${i}"]`);
    if (block) block.classList.toggle('bracket-selected', on);
  }
}

function clearPropositionHighlights() {
  document.querySelectorAll('.proposition-block.bracket-selected').forEach((b) => b.classList.remove('bracket-selected'));
}

function splitPropositionAtCaret(block, index) {
  const textSpan = block.querySelector('.proposition-text') ?? block;
  const currentText = (textSpan.textContent ?? '').trim() || '(empty)';
  propositions[index] = currentText;

  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const r = sel.getRangeAt(0);
  if (!block.contains(r.startContainer)) return;
  const measureRange = document.createRange();
  measureRange.setStart(textSpan, 0);
  measureRange.setEnd(r.startContainer, r.startOffset);
  const offset = measureRange.toString().length;
  if (offset <= 0 || offset >= currentText.length) return;
  splitPropositionAtOffset(index, offset);
}

function getVerseBase(ref) {
  return (ref || '').replace(/[a-z]+$/, '');
}

function incrementVerseRef(ref) {
  const m = ref.match(/^(.+?)([a-z]*)$/);
  const base = m[1];
  const suffix = m[2] || '';
  if (suffix === '') return base + 'a';
  const last = suffix.slice(-1);
  const rest = suffix.slice(0, -1);
  if (last === 'z') return base + rest + 'za';
  return base + rest + String.fromCharCode(last.charCodeAt(0) + 1);
}

function splitPropositionAtOffset(index, offset) {
  const text = propositions[index];
  const before = text.slice(0, offset).trim();
  const after = text.slice(offset).trim();
  if (!after) return;
  undoStack.push({ action: 'divide', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });
  const baseRef = verseRefs[index] || String(index + 1);
  const firstRef = /[a-z]$/.test(baseRef) ? baseRef : baseRef + 'a';
  const secondRef = incrementVerseRef(firstRef);
  const verseBase = getVerseBase(baseRef);

  propositions[index] = before || '(empty)';
  propositions.splice(index + 1, 0, after);
  verseRefs[index] = firstRef;
  verseRefs.splice(index + 1, 0, secondRef);

  for (let j = verseRefs.length - 1; j >= index + 2; j--) {
    if (getVerseBase(verseRefs[j]) === verseBase) {
      verseRefs[j] = incrementVerseRef(verseRefs[j]);
    }
  }
  brackets = brackets.map(({ from, to, type, labelsSwapped }) => ({
    from: from > index ? from + 1 : from,
    to: to > index ? to + 1 : to,
    type,
    labelsSwapped: labelsSwapped ?? false,
  }));

  comments.forEach(c => {
    if (c.type === 'text' && c.target) {
      if (c.target.propIndex > index) {
        c.target.propIndex += 1;
      } else if (c.target.propIndex === index) {
        if (c.target.start >= offset) {
          c.target.propIndex += 1;
          c.target.start -= offset;
          c.target.end -= offset;
        } else if (c.target.end > offset) {
          c.target.end = offset;
        }
      }
    }
  });

  formatTags.forEach(f => {
    if (f.propIndex > index) f.propIndex += 1;
    else if (f.propIndex === index) {
      if (f.start >= offset) {
        f.propIndex += 1;
        f.start -= offset;
        f.end -= offset;
      } else if (f.end > offset) {
        f.end = offset;
      }
    }
  });

  wordArrows.forEach(wa => {
    // fromProp shift
    if (wa.fromProp > index) wa.fromProp += 1;
    else if (wa.fromProp === index) {
      if (wa.fromStart >= offset) {
        wa.fromProp += 1;
        wa.fromStart -= offset;
        wa.fromEnd -= offset;
      } else if (wa.fromEnd > offset) {
        wa.fromEnd = offset;
      }
    }
    // toProp shift
    if (wa.toProp > index) wa.toProp += 1;
    else if (wa.toProp === index) {
      if (wa.toStart >= offset) {
        wa.toProp += 1;
        wa.toStart -= offset;
        wa.toEnd -= offset;
      } else if (wa.toEnd > offset) {
        wa.toEnd = offset;
      }
    }
  });
  renderPropositions();
  showStatus('Divided. Use Undo divide to merge back.', 'success');
}

function undoLastAction() {
  if (undoStack.length === 0) {
    showStatus('Nothing to undo.', 'error');
    return;
  }
  const prev = undoStack.pop();
  propositions = prev.propositions;
  verseRefs = prev.verseRefs ?? propositions.map((_, i) => String(i + 1));
  brackets = prev.brackets;
  formatTags = prev.formatTags ? prev.formatTags.map(t => ({...t})) : [];
  wordArrows = prev.wordArrows ? prev.wordArrows.map(w => ({...w})) : [];
  selectedArrowIdx = null;
  renderPropositions();
  showStatus(`Undid last ${prev.action}.`, 'success');
}


function updateBracketPositions() {
  requestAnimationFrame(() => {
    renderBrackets();
  });
}

// Bracket label abbreviations
const BRACKET_LABELS = {
  series: 'S',
  progression: 'P/*',
  alternative: 'A',
  ground: '*/G',
  inference: 'I',
  bilateral: 'BL',
  'cause-effect': 'C/E*',
  'action-result': 'C/E*', // legacy alias
  'action-purpose': 'Ac/Pur*',
  conditional: 'If/Th*',
  temporal: '*/T',
  locative: '*/L',
  'action-manner': 'Ac*/Mn',
  comparison: '*/Cf',
  'negative-positive': '-/+*',
  'idea-explanation': 'Id/Exp*',
  'question-answer': 'Q/A*',
  concessive: 'Csv',
  'situation-response': 'Sit/R*',
  unspecified: '?',
};

// Bracket geometry constants (shared for getConnectionPoints and renderBrackets)
const BRACKET_GEO = {
  PADDING_LEFT: 390, // Kept for getConnectionPoints; overridden dynamically in renderBrackets
  GAP: 4,
  BRACKET_WIDTH: 10,
  SLOT_WIDTH: 28, // Horizontal gap between slots so labels don't overlap
  MIN_TEXT_WIDTH: 600, // Minimum width reserved for proposition text
  BASE_PADDING: 48,  // Base left padding when no brackets are present
};

let _slotForIdx = {};
let _maxSlot = 0;

function bracketContainsForSlot(outer, outerIdx, inner, innerIdx) {
  if (outerIdx === innerIdx) return false;
  const spanContains = outer.from <= inner.from && outer.to >= inner.to && (outer.from < inner.from || outer.to > inner.to);
  const adjacentFrames = outer.to === inner.from && outer.from < inner.from;
  return spanContains || adjacentFrames;
}

function computeSlotAssignments() {
  _slotForIdx = {};
  const order = [];
  const visited = new Set();
  const visit = (idx) => {
    if (visited.has(idx)) return;
    visited.add(idx);
    brackets.forEach((a, i) => {
      if (bracketContainsForSlot(brackets[idx], idx, a, i)) visit(i);
    });
    order.push(idx);
  };
  brackets.forEach((_, i) => visit(i));
  order.forEach((idx) => {
    const bracket = brackets[idx];
    const contained = brackets
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => bracketContainsForSlot(bracket, idx, a, i));
    if (contained.length === 0) {
      _slotForIdx[idx] = 0;
    } else {
      _slotForIdx[idx] = 1 + Math.max(...contained.map(({ i }) => _slotForIdx[i]));
    }
  });
  _maxSlot = brackets.length ? Math.max(...Object.values(_slotForIdx)) : 0;
}

function getBracketX(bracketIdx) {
  const slot = _slotForIdx[bracketIdx] ?? 0;
  const { GAP, BRACKET_WIDTH, SLOT_WIDTH, BASE_PADDING } = BRACKET_GEO;
  // Recompute dynamicPaddingLeft the same way renderBrackets does
  const dynamicPaddingLeft = Math.max(200, brackets.length
    ? BASE_PADDING + GAP + BRACKET_WIDTH + (_maxSlot + 1) * SLOT_WIDTH
    : BASE_PADDING);
  return dynamicPaddingLeft - GAP - BRACKET_WIDTH - slot * SLOT_WIDTH;
}

function getConnectionPoints(spanFrom, spanTo, positions, excludeBracketIdx = -1) {
  const innerAtTop = brackets
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => i !== excludeBracketIdx && a.from === spanFrom && a.to < spanTo)
    .sort((x, y) => y.a.to - x.a.to)[0];
  const innerAtBottom = brackets
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => i !== excludeBracketIdx && a.to === spanTo && a.from > spanFrom)
    .sort((x, y) => x.a.from - y.a.from)[0];
  // Also look for an adjacent bracket starting exactly at spanTo (mirrors bracketContainsForSlot adjacentFrames)
  const adjacentAtBottom = !innerAtBottom
    ? brackets
        .map((a, i) => ({ a, i }))
        .filter(({ a, i }) => i !== excludeBracketIdx && a.from === spanTo && a.to > spanTo)
        .sort((x, y) => x.a.to - y.a.to)[0]
    : null;

  let topY, topLeft, bottomY, bottomLeft;

  if (innerAtTop) {
    const a = innerAtTop.a;
    const innerPoints = getConnectionPoints(a.from, a.to, positions, innerAtTop.i);
    if (SINGLE_LABEL_TYPES.has(a.type)) {
      topY = (innerPoints.topY + innerPoints.bottomY) / 2;
      topLeft = getBracketX(innerAtTop.i);
    } else {
      const innerLabels = getBracketLabels(a.type, a.labelsSwapped ?? false);
      const starAtTop = (innerLabels.top || '').includes('*');
      topY = starAtTop ? innerPoints.topY : innerPoints.bottomY;
      topLeft = getBracketX(innerAtTop.i);
    }
  } else {
    topY = positions[spanFrom].midY;
    topLeft = positions[spanFrom].left;
  }

  if (innerAtBottom) {
    const a = innerAtBottom.a;
    const innerPoints = getConnectionPoints(a.from, a.to, positions, innerAtBottom.i);
    if (SINGLE_LABEL_TYPES.has(a.type)) {
      bottomY = (innerPoints.topY + innerPoints.bottomY) / 2;
      bottomLeft = getBracketX(innerAtBottom.i);
    } else {
      const innerLabels = getBracketLabels(a.type, a.labelsSwapped ?? false);
      const starAtTop = (innerLabels.top || '').includes('*');
      bottomY = starAtTop ? innerPoints.topY : innerPoints.bottomY;
      bottomLeft = getBracketX(innerAtBottom.i);
    }
  } else if (adjacentAtBottom) {
    // Adjacent bracket starts exactly at spanTo — connect arm to its X line
    const a = adjacentAtBottom.a;
    const innerPoints = getConnectionPoints(a.from, a.to, positions, adjacentAtBottom.i);
    if (SINGLE_LABEL_TYPES.has(a.type)) {
      // Single-label (Series, Alternative, etc.): connect to its center
      bottomY = (innerPoints.topY + innerPoints.bottomY) / 2;
      bottomLeft = getBracketX(adjacentAtBottom.i);
    } else {
      // Two-label: connect to whichever end has the *, same as nested bracket logic
      const innerLabels = getBracketLabels(a.type, a.labelsSwapped ?? false);
      const starAtTop = (innerLabels.top || '').includes('*');
      bottomY = starAtTop ? innerPoints.topY : innerPoints.bottomY;
      bottomLeft = getBracketX(adjacentAtBottom.i);
    }
  } else {
    bottomY = positions[spanTo].midY;
    bottomLeft = positions[spanTo].left;
  }

  return { topY, topLeft, bottomY, bottomLeft };
}

function getBracketLabels(type, labelsSwapped = false) {
  const label = BRACKET_LABELS[type] || type.slice(0, 2);
  if (SINGLE_LABEL_TYPES.has(type)) {
    return { single: label };
  }
  let top, bottom;
  if (label.includes('/')) {
    const parts = label.split('/');
    top = (parts[0] || '').trim();
    bottom = (parts[1] || '').trim();
  } else {
    top = label;
    bottom = '*';
  }
  if (labelsSwapped) [top, bottom] = [bottom, top];
  return { top, bottom };
}

// Draw visible SVG brackets between propositions
function renderWordArrows(wrapper) {
  const wrapperRect = wrapper.getBoundingClientRect();
  wordArrows.forEach((wa, idx) => {
    const fromEl = document.querySelector(`.arrow-anchor[data-arrow-id="arrow-${idx}-from"]`);
    const toEl = document.querySelector(`.arrow-anchor[data-arrow-id="arrow-${idx}-to"]`);
    if (!fromEl || !toEl) return;

    const fromR = fromEl.getBoundingClientRect();
    const toR = toEl.getBoundingClientRect();

    // word boundaries relative to wrapper
    const fL = fromR.left - wrapperRect.left;
    const fR = fromR.right - wrapperRect.left;
    const fM = fromR.top + fromR.height / 2 - wrapperRect.top;

    const tL = toR.left - wrapperRect.left;
    const tR = toR.right - wrapperRect.left;
    const tM = toR.top + toR.height / 2 - wrapperRect.top;
    const tT = toR.top - wrapperRect.top;
    const tB = toR.bottom - wrapperRect.top;
    const tC = toR.left + toR.width / 2 - wrapperRect.left;

    const fC = fromR.left + fromR.width / 2 - wrapperRect.left;
    const fT = fromR.top - wrapperRect.top;
    const fB = fromR.bottom - wrapperRect.top;

    const tBeg = tL + 5; // Beginning of word (first letter area)
    const fBeg = fL + 5;

    let x1, y1, x2, y2, isLastHorizontal;
    
    if (tM < fM - 10) {
      // UPWARDS: Horizontal then Vertical (Arrival at bottom edge)
      x1 = (tBeg < fL) ? fL : (tBeg > fR ? fR : fBeg);
      y1 = fM;
      x2 = tBeg;
      y2 = tB + 2;
      isLastHorizontal = false;
    } else if (tM > fM + 10) {
      // DOWNWARDS: Vertical then Horizontal (Arrival at side)
      // If arriving at side, "beginning" is the left side anyway (tL)
      x1 = fBeg;
      y1 = fB;
      y2 = tM;
      x2 = (fBeg > tC) ? tR + 2 : tL - 2;
      isLastHorizontal = true;
    } else {
      // SAME LINE: Horizontal only
      x1 = (tBeg < fBeg) ? fL : fR;
      y1 = fM;
      x2 = (tBeg < fBeg) ? tR + 2 : tL - 2;
      y2 = fM;
      isLastHorizontal = true;
    }

    const d = (isLastHorizontal && y1 !== y2) 
      ? `M ${x1} ${y1} V ${y2} H ${x2}` 
      : `M ${x1} ${y1} H ${x2} V ${y2}`;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'word-arrow-group');

    const isSelected = selectedArrowIdx === idx;
    if (isSelected) {
      g.style.color = '#ff6b6b'; // Red highlight for selection
    } else {
      g.style.color = 'var(--accent)';
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', isSelected ? '3' : '2');
    g.appendChild(path);

    // Manual Arrowhead (Polygon) - using polygon to avoid CSS 'path' specificity issue
    let points = '';
    const hL = 7; // head length
    const hW = 3.5;  // head half-width
    if (isLastHorizontal) {
      if (x2 < x1) points = `${x2},${y2} ${x2+hL},${y2-hW} ${x2+hL},${y2+hW}`; // Left
      else points = `${x2},${y2} ${x2-hL},${y2-hW} ${x2-hL},${y2+hW}`; // Right
    } else {
      if (y2 < y1) points = `${x2},${y2} ${x2-hW},${y2+hL} ${x2+hW},${y2+hL}`; // Up
      else points = `${x2},${y2} ${x2-hW},${y2-hL} ${x2+hW},${y2-hL}`; // Down
    }
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    head.setAttribute('points', points);
    head.setAttribute('fill', 'var(--accent)');
    head.style.fill = 'var(--accent)';
    g.appendChild(head);

    // Hit area
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'rgba(0,0,0,0.01)'); // Near-transparent but better for some browsers
    hit.setAttribute('stroke-width', '10');
    hit.style.pointerEvents = 'all';
    hit.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      undoStack.push({ action: 'delete arrow', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map(a => ({...a})), formatTags: formatTags.map(f => ({...f})), wordArrows: wordArrows.map(w => ({...w})) });
      wordArrows.splice(idx, 1);
      renderBrackets();
      showStatus('Arrow removed.', 'success');
    });
    hit.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedArrowIdx = idx;
      renderPropositions();
      renderBrackets();
    });
    g.appendChild(hit);

    bracketCanvas.appendChild(g);
  });
}

function renderBrackets() {
  if (!propositionsContainer?.parentElement || !bracketCanvas) return;
  const wrapper = propositionsContainer.parentElement;
  const rect = wrapper.getBoundingClientRect();

  bracketCanvas.setAttribute('width', rect.width);
  bracketCanvas.setAttribute('height', rect.height);
  bracketCanvas.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

  bracketCanvas.innerHTML = '';
  // (defs and marker removed, now handled inline in renderWordArrows)


  const BRACKET_STROKE = 1;
  const { GAP, BRACKET_WIDTH, SLOT_WIDTH, MIN_TEXT_WIDTH, BASE_PADDING } = BRACKET_GEO;

  computeSlotAssignments();
  const slotForIdx = _slotForIdx;
  const maxSlot = _maxSlot;

  // Dynamically compute the left padding based on actual nesting depth (min 200px)
  const dynamicPaddingLeft = Math.max(200, brackets.length
    ? BASE_PADDING + GAP + BRACKET_WIDTH + (maxSlot + 1) * SLOT_WIDTH
    : BASE_PADDING);
  const PADDING_LEFT = dynamicPaddingLeft;

  // Update the propositions gutter and wrapper min-width to match
  if (propositionsContainer) {
    propositionsContainer.classList.add('bracket-gutter');
    propositionsContainer.style.paddingLeft = `${PADDING_LEFT}px`;
  }
  const canvasWrapper = propositionsContainer?.parentElement;
  if (canvasWrapper) {
    canvasWrapper.style.minWidth = `${PADDING_LEFT + MIN_TEXT_WIDTH}px`;
  }

  // Measure positions AFTER padding is applied to ensure sync
  const blocks = propositionsContainer.querySelectorAll('.proposition-block');
  const positions = Array.from(blocks).map((b) => {
    const r = b.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    return {
      left: r.left - wrapperRect.left,
      x: r.left - wrapperRect.left + r.width / 2,
      y: r.top - wrapperRect.top,
      bottom: r.bottom - wrapperRect.top,
      midY: r.top - wrapperRect.top + r.height / 2,
    };
  });

  const labelsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  labelsLayer.setAttribute('class', 'bracket-labels-layer');

  renderWordArrows(wrapper);

  brackets.forEach((bracket, idx) => {
    const { from, to, type, labelsSwapped } = bracket;
    const a = positions[from];
    const b = positions[to];
    if (!a || !b) return;

    const slot = slotForIdx[idx] ?? 0;
    const BRACKET_X = PADDING_LEFT - GAP - BRACKET_WIDTH - slot * SLOT_WIDTH;

    // Bracket ends at * for inner brackets, or middle for single-label; otherwise at proposition centers
    const { topY, topLeft, bottomY, bottomLeft } = getConnectionPoints(from, to, positions, idx);

    const hasComment = !!getCommentForBracket(idx);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-bracket-index', idx);
    g.classList.add('bracket-group');
    if (hasComment) g.classList.add('has-comment');
    const d = `M ${topLeft} ${topY} L ${BRACKET_X} ${topY} L ${BRACKET_X} ${bottomY} L ${bottomLeft} ${bottomY}`;
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', 16);
    hitPath.setAttribute('class', 'bracket-hit');
    hitPath.setAttribute('stroke-linecap', 'square');
    hitPath.setAttribute('stroke-linejoin', 'miter');
    hitPath.setAttribute('pointer-events', 'stroke');
    g.appendChild(hitPath);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', type);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', BRACKET_STROKE);
    path.setAttribute('stroke-linecap', 'square');
    path.setAttribute('stroke-linejoin', 'miter');
    if (type === 'unspecified') path.setAttribute('stroke-dasharray', '6,4');
    g.appendChild(path);
    if (hasComment) {
      const highlightPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      highlightPath.setAttribute('d', d);
      highlightPath.setAttribute('class', 'bracket-comment-highlight');
      highlightPath.setAttribute('fill', 'none');
      highlightPath.setAttribute('stroke', '#e8c968');
      highlightPath.setAttribute('stroke-opacity', '0.55');
      highlightPath.setAttribute('stroke-width', '14');
      highlightPath.setAttribute('stroke-linecap', 'square');
      highlightPath.setAttribute('stroke-linejoin', 'miter');
      highlightPath.setAttribute('pointer-events', 'none');
      g.appendChild(highlightPath);
    }

    const attachBracketEvents = (el, setPointerEvents = true) => {
      if (setPointerEvents) el.style.pointerEvents = 'all';
      el.style.cursor = 'pointer';
      el.addEventListener('mouseenter', () => {
        if (g) g.classList.add('bracket-hover');
        // Bold the labels for this bracket
        bracketCanvas.querySelectorAll(`.bracket-label[data-bracket-index="${idx}"]`).forEach(lbl => {
          lbl.style.fontWeight = 'bold';
        });
        if (hasComment) {
          const comment = getCommentForBracket(idx);
          if (comment) {
            const card = document.querySelector(`.comments-preview-card[data-comment-id="${comment.id}"]`);
            if (card) {
              card.classList.add('comment-hover-active');
              card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        }
        for (let j = bracket.from; j <= bracket.to; j++) {
          const block = propositionsContainer.querySelector(`[data-index="${j}"]`);
          if (block) block.classList.add('bracket-hover');
        }
      });
      el.addEventListener('mouseleave', () => {
        if (g) g.classList.remove('bracket-hover');
        // Un-bold the labels for this bracket
        bracketCanvas.querySelectorAll(`.bracket-label[data-bracket-index="${idx}"]`).forEach(lbl => {
          lbl.style.fontWeight = '';
        });
        document.querySelectorAll('.comments-preview-card.comment-hover-active').forEach(c => c.classList.remove('comment-hover-active'));
        document.querySelectorAll('.proposition-block.bracket-hover').forEach((b) => b.classList.remove('bracket-hover'));
      });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const centerY = topY + (bottomY - topY) / 2;
        const centerX = BRACKET_X + BRACKET_WIDTH / 2;
        if (commentMode) {
          showCommentPopoverForBracket(idx, centerY, centerX);
          return;
        }
        if (e.detail === 2) {
          bracketSelectStep = 0;
          bracketFrom = null;
          clearPropositionHighlights();
          showLabelPicker(idx, centerY, centerX);
        } else if (type === 'unspecified') {
          // Unlabelled bracket: single click opens relationship picker to choose type
          showLabelPicker(idx, centerY, centerX);
        } else {
          showBracketActions(idx, centerY, centerX);
        }
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });
        brackets.splice(idx, 1);
        renderBrackets();
        showStatus('Bracket removed.', 'success');
      });
    };

    const labels = getBracketLabels(type, labelsSwapped ?? false);
    if (labels.single !== undefined) {
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', BRACKET_X - 4);
      textEl.setAttribute('y', topY + (bottomY - topY) / 2);
      textEl.setAttribute('text-anchor', 'end');
      textEl.setAttribute('dominant-baseline', 'central');
      textEl.setAttribute('font-size', '12');
      textEl.setAttribute('class', `bracket-label ${type}`);
      textEl.setAttribute('data-bracket-index', idx);
      textEl.textContent = labels.single;
      attachBracketEvents(textEl, false);
      labelsLayer.appendChild(textEl);
    } else {
      const topLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      topLabel.setAttribute('x', BRACKET_X - 4);
      topLabel.setAttribute('y', topY);
      topLabel.setAttribute('text-anchor', 'end');
      topLabel.setAttribute('dominant-baseline', 'central');
      topLabel.setAttribute('font-size', '12');
      topLabel.setAttribute('class', `bracket-label ${type}`);
      topLabel.setAttribute('data-bracket-index', idx);
      topLabel.textContent = labels.top;
      const bottomLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      bottomLabel.setAttribute('x', BRACKET_X - 4);
      bottomLabel.setAttribute('y', bottomY);
      bottomLabel.setAttribute('text-anchor', 'end');
      bottomLabel.setAttribute('dominant-baseline', 'central');
      bottomLabel.setAttribute('font-size', '12');
      bottomLabel.setAttribute('class', `bracket-label ${type}`);
      bottomLabel.setAttribute('data-bracket-index', idx);
      bottomLabel.textContent = labels.bottom;
      attachBracketEvents(topLabel, false);
      attachBracketEvents(bottomLabel, false);
      labelsLayer.appendChild(topLabel);
      labelsLayer.appendChild(bottomLabel);
    }

    attachBracketEvents(g, false);
    bracketCanvas.appendChild(g);
  });

  bracketCanvas.appendChild(labelsLayer);

  // Connection nodes: one per proposition line + one per bracket (at * or center)
  const NODE_R = 6;
  const NODE_GAP = 2; // Gap between node and label/text
  const CHARS_TO_PX = 7; // Approx px per char at 12px font for label width

  const nodesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodesG.setAttribute('class', 'connection-nodes');
  nodesG.style.pointerEvents = 'all';

  // Proposition nodes: only for propositions NOT covered by any bracket
  positions.forEach((pos, i) => {
    const inBracket = brackets.some((a) => a.from <= i && i <= a.to);
    if (inBracket) return; // Hide node when proposition is part of a bracket

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.left - NODE_R - NODE_GAP);
    circle.setAttribute('cy', pos.midY);
    circle.setAttribute('r', NODE_R);
    circle.setAttribute('class', 'connection-node proposition-node');
    circle.setAttribute('data-index', i);
    circle.style.cursor = 'pointer';
    nodesG.appendChild(circle);

    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePropositionClick(i);
    });
  });

  // Bracket nodes: only for outermost brackets (hide nodes for brackets connected to by another)
  const innerBracketIndices = new Set();
  brackets.forEach((outer, j) => {
    const innerAtTop = brackets
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => i !== j && a.from === outer.from && a.to < outer.to)
      .sort((x, y) => y.a.to - x.a.to)[0];
    const innerAtBottom = brackets
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => i !== j && a.to === outer.to && a.from > outer.from)
      .sort((x, y) => x.a.from - y.a.from)[0];
    if (innerAtTop) innerBracketIndices.add(innerAtTop.i);
    if (innerAtBottom) innerBracketIndices.add(innerAtBottom.i);
  });

  brackets.forEach((bracket, idx) => {
    const isInner = innerBracketIndices.has(idx);

    const { from, to, type, labelsSwapped } = bracket;
    const { topY, topLeft, bottomY, bottomLeft } = getConnectionPoints(from, to, positions, idx);
    const BRACKET_X = getBracketX(idx);

    const labels = getBracketLabels(type, labelsSwapped ?? false);
    let nodeY;
    let labelText;
    if (SINGLE_LABEL_TYPES.has(type)) {
      nodeY = (topY + bottomY) / 2;
      labelText = labels.single || '';
    } else {
      const starAtTop = (labels.top || '').includes('*');
      nodeY = starAtTop ? topY : bottomY;
      labelText = starAtTop ? labels.top : labels.bottom;
    }
    const labelWidth = Math.max(12, (labelText?.length || 1) * CHARS_TO_PX);
    const nodeX = BRACKET_X - 4 - labelWidth - NODE_GAP - NODE_R; // Just left of label (label right edge at BRACKET_X - 4)

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', nodeX);
    circle.setAttribute('cy', nodeY);
    circle.setAttribute('r', NODE_R);
    circle.setAttribute('class', 'connection-node bracket-node' + (isInner ? ' bracket-node-inner' : ''));
    circle.setAttribute('data-bracket-index', idx);
    circle.style.cursor = 'pointer';
    nodesG.appendChild(circle);

    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      handleBracketGroupClick(idx);
    });

    const bracketGroup = bracketCanvas.querySelector(`.bracket-group[data-bracket-index="${idx}"]`);
    circle.addEventListener('mouseenter', () => {
      if (bracketGroup) bracketGroup.classList.add('bracket-hover');
      for (let j = bracket.from; j <= bracket.to; j++) {
        const block = propositionsContainer.querySelector(`[data-index="${j}"]`);
        if (block) block.classList.add('bracket-hover');
      }
    });
    circle.addEventListener('mouseleave', () => {
      if (bracketGroup) bracketGroup.classList.remove('bracket-hover');
      document.querySelectorAll('.proposition-block.bracket-hover').forEach((b) => b.classList.remove('bracket-hover'));
    });
  });

  bracketCanvas.appendChild(nodesG);
}

function getCommentForBracket(bracketIdx) {
  return comments.find((c) => c.type === 'bracket' && c.target && c.target.bracketIdx === bracketIdx) || null;
}

function getCommentById(id) {
  return comments.find((c) => c.id === id) || null;
}

const COMMENT_PREVIEW_MAX = 120;

function renderCommentPreviews() {
  const listEl = document.getElementById('commentsPreviewList');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (comments.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'comments-preview-empty';
    empty.textContent = 'No comments. Add one on a bracket or highlight text in Comment mode.';
    listEl.appendChild(empty);
    return;
  }
  comments.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'comments-preview-card';
    card.dataset.commentId = c.id;
    let context = '';
    if (c.type === 'bracket' && c.target && brackets[c.target.bracketIdx]) {
      const bracket = brackets[c.target.bracketIdx];
      const label = BRACKET_LABELS[bracket.type] || bracket.type;
      const fromRef = verseRefs[bracket.from] ?? String(bracket.from + 1);
      const toRef = verseRefs[bracket.to] ?? String(bracket.to + 1);
      context = `${label} · ${fromRef}–${toRef}`;
    } else if (c.type === 'text' && c.target != null) {
      const prop = propositions[c.target.propIndex];
      const snippet = prop ? prop.slice(c.target.start, c.target.end).replace(/\s+/g, ' ').trim() : '';
      context = snippet.length > 40 ? '"' + snippet.slice(0, 37) + '…"' : '"' + snippet + '"';
    }
    const textPreview = (c.text || '').length > COMMENT_PREVIEW_MAX
      ? c.text.slice(0, COMMENT_PREVIEW_MAX) + '…'
      : (c.text || '');
    const replyCount = (c.replies || []).length;
    const replyLabel = replyCount === 1 ? '1 reply' : replyCount > 1 ? `${replyCount} replies` : '';
    const authorHtml = (c.author || '').trim() ? `<div class="comment-preview-author">${escapeHtml((c.author || '').trim())}</div>` : '';
    card.innerHTML = `<div class="comment-context">${escapeHtml(context)}</div><div class="comment-text">${escapeHtml(textPreview)}</div>${authorHtml}${replyLabel ? `<div class="comment-preview-reply-count">${escapeHtml(replyLabel)}</div>` : ''}`;
    card.addEventListener('click', () => {
      if (c.type === 'bracket' && c.target != null) {
        const bracket = brackets[c.target.bracketIdx];
        if (bracket != null) {
          const block = propositionsContainer?.querySelector(`.proposition-block[data-index="${bracket.from}"]`);
          if (block) block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          const wrapper = bracketCanvas?.parentElement;
          if (wrapper) {
            const rect = wrapper.getBoundingClientRect();
            const blocks = propositionsContainer?.querySelectorAll('.proposition-block');
            const rFrom = blocks?.[bracket.from]?.getBoundingClientRect?.();
            const rTo = blocks?.[bracket.to]?.getBoundingClientRect?.();
            let centerY = rect.height / 2;
            let centerX = rect.width / 2;
            if (rFrom && rTo) {
              centerY = (rFrom.top + rFrom.bottom + rTo.top + rTo.bottom) / 4 - rect.top;
              centerX = (rFrom.left + rFrom.right + rTo.left + rTo.right) / 4 - rect.left;
            }
            showCommentPopoverForBracket(c.target.bracketIdx, centerY, centerX);
          }
        }
      } else if (c.type === 'text' && c.target != null) {
        const block = propositionsContainer?.querySelector(`.proposition-block[data-index="${c.target.propIndex}"]`);
        if (block) block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        showCommentPopoverForText(c.target.propIndex, c.target.start, c.target.end, c.id);
      }
    });
    listEl.appendChild(card);
  });
}

function makePopupDraggable(popover, handleSelector) {
  const wrapper = popover.parentElement;
  if (!wrapper) return;
  const handle = handleSelector ? popover.querySelector(handleSelector) : popover;
  if (!handle) return;

  handle.style.cursor = 'grab';
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // Don't drag if clicking buttons within the handle
    if (e.target.tagName === 'BUTTON') return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseFloat(popover.style.left) || 0;
    const startTop = parseFloat(popover.style.top) || 0;
    handle.style.cursor = 'grabbing';

    const onMove = (e2) => {
      const dx = e2.clientX - startX;
      const dy = e2.clientY - startY;
      const rect = wrapper.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      
      let left = startLeft + dx;
      let top = startTop + dy;
      
      // Constraints
      left = Math.max(0, Math.min(left, rect.width - popRect.width));
      top = Math.max(0, Math.min(top, rect.height - popRect.height));
      
      popover.style.left = left + 'px';
      popover.style.top = top + 'px';
    };

    const onUp = () => {
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      popover._dragJustEnded = true;
      setTimeout(() => { popover._dragJustEnded = false; }, 0);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function makeCommentPopoverDraggableAndResizable(popover) {
  const wrapper = popover.parentElement;
  if (!wrapper) return;
  
  makePopupDraggable(popover, '.comment-popover-title');

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'comment-popover-resize-handle';
  resizeHandle.setAttribute('aria-label', 'Resize');
  popover.appendChild(resizeHandle);
  const minW = 260;
  const maxW = Math.min(1200, Math.max(360, wrapper.getBoundingClientRect().width * 0.9));
  const minH = 200;
  const maxH = Math.min(window.innerHeight * 0.85, wrapper.getBoundingClientRect().height);
  resizeHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = popover.offsetWidth;
    const startH = popover.offsetHeight;
    const onMove = (e2) => {
      const dw = e2.clientX - startX;
      const dh = e2.clientY - startY;
      let w = Math.max(minW, Math.min(maxW, startW + dw));
      let h = Math.max(minH, Math.min(maxH, startH + dh));
      popover.style.width = w + 'px';
      popover.style.height = h + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function showCommentPopoverForText(propIndex, start, end, existingCommentId = null, options = {}) {
  const existing = document.getElementById('commentPopover');
  if (existing) existing.remove();

  const existingComment = existingCommentId ? getCommentById(existingCommentId) : null;
  const viewMode = options.viewMode === true || (!!existingComment && options.viewMode !== false);
  const commentAuthor = (existingComment && existingComment.author) || localStorage.getItem(COMMENT_AUTHOR_KEY) || '';

  const popover = document.createElement('div');
  popover.id = 'commentPopover';
  popover.className = 'comment-popover';

  if (viewMode) {
    const metaStr = `${escapeHtml((existingComment.author || '').trim() || '')} · ${existingComment.createdAt ? new Date(existingComment.createdAt).toLocaleString() : ''}`;
    popover.innerHTML = `
      <p class="comment-popover-title">Comment on text</p>
      <div class="comment-body-view">
        <span class="comment-reply-meta">${metaStr}</span>
        <div class="comment-body-view-text">${escapeHtml(existingComment.text || '')}</div>
      </div>
      <div class="comment-popover-actions">
        <button type="button" data-action="edit">Edit</button>
        <button type="button" data-action="delete" class="secondary">Remove comment</button>
        <button type="button" data-action="cancel" class="secondary">Cancel</button>
      </div>
      <div class="comment-replies-section"><p class="comment-replies-title">Replies (${(existingComment.replies || []).length})</p><div class="comment-replies-list" data-comment-id="${existingComment.id}"></div><div class="comment-reply-add"><div class="comment-reply-author-row"><label for="replyAuthorText">Author:</label><input type="text" id="replyAuthorText" class="author-input" placeholder="Your name" value="${escapeHtml(localStorage.getItem(COMMENT_AUTHOR_KEY) || '')}"></div><textarea rows="2" placeholder="Add a reply…"></textarea><button type="button" data-action="add-reply" class="secondary">Reply</button></div></div>
    `;
  } else {
    popover.innerHTML = `
      <p class="comment-popover-title">${existingComment ? 'View / Edit comment on text' : 'Add comment to highlighted text'}</p>
      <div class="comment-popover-author-row">
        <label for="commentAuthorText">Author:</label>
        <input type="text" id="commentAuthorText" class="author-input" placeholder="Your name" value="${escapeHtml(commentAuthor)}">
      </div>
      <textarea rows="3" placeholder="Your note…">${existingComment ? escapeHtml(existingComment.text || '') : ''}</textarea>
      <div class="comment-popover-actions">
        <button type="button" data-action="save">${existingComment ? 'Update' : 'Save'}</button>
        ${existingComment ? '<button type="button" data-action="delete" class="secondary">Remove comment</button>' : ''}
        <button type="button" data-action="cancel" class="secondary">Cancel</button>
      </div>
      ${existingComment ? `<div class="comment-replies-section"><p class="comment-replies-title">Replies (${(existingComment.replies || []).length})</p><div class="comment-replies-list" data-comment-id="${existingComment.id}"></div><div class="comment-reply-add"><div class="comment-reply-author-row"><label for="replyAuthorText">Author:</label><input type="text" id="replyAuthorText" class="author-input" placeholder="Your name" value="${escapeHtml(localStorage.getItem(COMMENT_AUTHOR_KEY) || '')}"></div><textarea rows="2" placeholder="Add a reply…"></textarea><button type="button" data-action="add-reply" class="secondary">Reply</button></div></div>` : ''}
    `;
  }

  const wrapper = bracketCanvas?.parentElement || document.body;
  const wrapperRect = wrapper.getBoundingClientRect();
  let anchorRect = options.anchorRect || null;
  if (!anchorRect && existingCommentId && propositionsContainer) {
    const mark = propositionsContainer.querySelector(`.comment-highlight[data-comment-id="${existingCommentId}"]`);
    if (mark) anchorRect = mark.getBoundingClientRect();
  }
  if (anchorRect) {
    const gap = 8;
    const leftOffset = 120;
    let left = anchorRect.left - wrapperRect.left - leftOffset;
    let top = anchorRect.bottom - wrapperRect.top + gap;
    const popoverW = options.lastWidth != null ? options.lastWidth : 640;
    const popoverH = options.lastHeight != null ? options.lastHeight : 420;
    left = Math.max(8, Math.min(left, wrapperRect.width - popoverW));
    top = Math.max(8, Math.min(top, wrapperRect.height - Math.min(popoverH, wrapperRect.height)));
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
  } else {
    const rect = wrapperRect;
    const leftOffset = 120;
    popover.style.left = `${Math.max(8, rect.width / 2 - 140 - leftOffset)}px`;
    popover.style.top = `${Math.max(8, rect.height / 2 - 80)}px`;
  }
  wrapper.appendChild(popover);
  if (options.lastWidth != null) popover.style.width = options.lastWidth + 'px';
  if (options.lastHeight != null) popover.style.height = options.lastHeight + 'px';
  if (options.lastLeft != null) popover.style.left = options.lastLeft;
  if (options.lastTop != null) popover.style.top = options.lastTop;
  makeCommentPopoverDraggableAndResizable(popover);

  if (viewMode) {
    popover.querySelector('[data-action="edit"]').addEventListener('click', () => {
      const lastWidth = popover.offsetWidth;
      const lastHeight = popover.offsetHeight;
      const lastLeft = popover.style.left;
      const lastTop = popover.style.top;
      popover.remove();
      document.removeEventListener('click', dismiss);
      showCommentPopoverForText(propIndex, start, end, existingComment.id, { viewMode: false, lastWidth, lastHeight, lastLeft, lastTop });
    });
    popover.querySelector('[data-action="delete"]').addEventListener('click', () => {
      comments = comments.filter((c) => c.id !== existingComment.id);
      popover.remove();
      document.removeEventListener('click', dismiss);
      renderPropositions();
      renderCommentPreviews();
      showStatus('Comment removed.', 'success');
    });
    popover.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      popover.remove();
      document.removeEventListener('click', dismiss);
    });
    const repliesList = popover.querySelector('.comment-replies-list');
    const replyCountEl = popover.querySelector('.comment-replies-title');
    const renderReplies = () => {
      if (!repliesList) return;
      repliesList.innerHTML = '';
      const replies = existingComment.replies || [];
      replyCountEl.textContent = `Replies (${replies.length})`;
      replies.forEach((r) => {
        const div = document.createElement('div');
        div.className = 'comment-reply-item';
        div.innerHTML = `<span class="comment-reply-meta">${escapeHtml(r.author || '')} · ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span><p class="comment-reply-text">${escapeHtml(r.text || '')}</p>`;
        repliesList.appendChild(div);
      });
    };
    renderReplies();
    const replyTa = popover.querySelector('.comment-reply-add textarea');
    const replyAuthorInput = popover.querySelector('#replyAuthorText');
    const addReplyBtn = popover.querySelector('[data-action="add-reply"]');
    if (addReplyBtn && replyTa) {
      addReplyBtn.addEventListener('click', () => {
        const replyText = (replyTa.value || '').trim();
        if (!replyText) return;
        const replyAuthor = (replyAuthorInput && replyAuthorInput.value || '').trim() || (localStorage.getItem(COMMENT_AUTHOR_KEY) || '');
        if (replyAuthor) try { localStorage.setItem(COMMENT_AUTHOR_KEY, replyAuthor); } catch (_) {}
        if (!existingComment.replies) existingComment.replies = [];
        existingComment.replies.push({
          id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
          text: replyText,
          author: replyAuthor || undefined,
          createdAt: new Date().toISOString(),
        });
        replyTa.value = '';
        renderReplies();
        renderCommentPreviews();
      });
    }
  } else {
  const ta = popover.querySelector('textarea');
  const authorInput = popover.querySelector('#commentAuthorText');
  ta.focus();

  if (existingComment) {
    const repliesList = popover.querySelector('.comment-replies-list');
    const replyCountEl = popover.querySelector('.comment-replies-title');
    const renderReplies = () => {
      if (!repliesList) return;
      repliesList.innerHTML = '';
      const replies = existingComment.replies || [];
      replyCountEl.textContent = `Replies (${replies.length})`;
      replies.forEach((r) => {
        const div = document.createElement('div');
        div.className = 'comment-reply-item';
        div.innerHTML = `<span class="comment-reply-meta">${escapeHtml(r.author || '')} · ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span><p class="comment-reply-text">${escapeHtml(r.text || '')}</p>`;
        repliesList.appendChild(div);
      });
    };
    renderReplies();
    const replyTa = popover.querySelector('.comment-reply-add textarea');
    const replyAuthorInput = popover.querySelector('#replyAuthorText');
    const addReplyBtn = popover.querySelector('[data-action="add-reply"]');
    if (addReplyBtn && replyTa) {
      addReplyBtn.addEventListener('click', () => {
        const replyText = (replyTa.value || '').trim();
        if (!replyText) return;
        const replyAuthor = (replyAuthorInput && replyAuthorInput.value || '').trim() || (localStorage.getItem(COMMENT_AUTHOR_KEY) || '');
        if (replyAuthor) try { localStorage.setItem(COMMENT_AUTHOR_KEY, replyAuthor); } catch (_) {}
        if (!existingComment.replies) existingComment.replies = [];
        existingComment.replies.push({
          id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
          text: replyText,
          author: replyAuthor || undefined,
          createdAt: new Date().toISOString(),
        });
        replyTa.value = '';
        renderReplies();
        renderCommentPreviews();
      });
    }
  }

  popover.querySelector('[data-action="save"]').addEventListener('click', () => {
    const text = (ta.value || '').trim();
    const author = (authorInput && authorInput.value || '').trim();
    if (author) try { localStorage.setItem(COMMENT_AUTHOR_KEY, author); } catch (_) {}
    let savedCommentId = null;
    if (existingComment) {
      existingComment.text = text;
      existingComment.author = author || existingComment.author;
      if (!text) comments = comments.filter((c) => c.id !== existingComment.id);
      else {
        savedCommentId = existingComment.id;
        if (existingComment.target && existingComment.target.propIndex === propIndex) {
          existingComment.target.start = start;
          existingComment.target.end = end;
        }
      }
    } else if (text) {
      const newId = nextCommentId();
      comments.push({
        id: newId,
        type: 'text',
        target: { propIndex, start, end },
        text,
        author: author || undefined,
        createdAt: new Date().toISOString(),
        replies: [],
      });
      savedCommentId = newId;
    }
    const lastWidth = popover.offsetWidth;
    const lastHeight = popover.offsetHeight;
    const lastLeft = popover.style.left;
    const lastTop = popover.style.top;
    popover.remove();
    document.removeEventListener('click', dismiss);
    renderPropositions();
    renderCommentPreviews();
    showStatus(existingComment ? (text ? 'Comment updated.' : 'Comment removed.') : 'Comment added.', 'success');
    if (savedCommentId) showCommentPopoverForText(propIndex, start, end, savedCommentId, { viewMode: true, lastWidth, lastHeight, lastLeft, lastTop });
  });

  if (existingComment) {
    popover.querySelector('[data-action="delete"]').addEventListener('click', () => {
      comments = comments.filter((c) => c.id !== existingComment.id);
      popover.remove();
      document.removeEventListener('click', dismiss);
      renderPropositions();
      renderCommentPreviews();
      showStatus('Comment removed.', 'success');
    });
  }

  popover.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    popover.remove();
    document.removeEventListener('click', dismiss);
  });
  }

  const dismiss = (e) => {
    if (popover._dragJustEnded) return;
    if (popover.parentNode && popover.contains(e.target)) return;
    popover.remove();
    document.removeEventListener('click', dismiss);
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

function showCommentPopoverForBracket(bracketIdx, centerY, centerX, options = {}) {
  const existing = document.getElementById('commentPopover');
  if (existing) existing.remove();

  const existingComment = getCommentForBracket(bracketIdx);
  const viewMode = options.viewMode === true || (!!existingComment && options.viewMode !== false);
  const commentAuthor = (existingComment && existingComment.author) || localStorage.getItem(COMMENT_AUTHOR_KEY) || '';

  const popover = document.createElement('div');
  popover.id = 'commentPopover';
  popover.className = 'comment-popover';

  if (viewMode) {
    const metaStr = `${escapeHtml((existingComment.author || '').trim() || '')} · ${existingComment.createdAt ? new Date(existingComment.createdAt).toLocaleString() : ''}`;
    popover.innerHTML = `
      <p class="comment-popover-title">Comment on bracket</p>
      <div class="comment-body-view">
        <span class="comment-reply-meta">${metaStr}</span>
        <div class="comment-body-view-text">${escapeHtml(existingComment.text || '')}</div>
      </div>
      <div class="comment-popover-actions">
        <button type="button" data-action="edit">Edit</button>
        <button type="button" data-action="delete" class="secondary">Remove comment</button>
        <button type="button" data-action="cancel" class="secondary">Cancel</button>
      </div>
      <div class="comment-replies-section"><p class="comment-replies-title">Replies (${(existingComment.replies || []).length})</p><div class="comment-replies-list" data-comment-id="${existingComment.id}"></div><div class="comment-reply-add"><div class="comment-reply-author-row"><label for="replyAuthorBracket">Author:</label><input type="text" id="replyAuthorBracket" class="author-input" placeholder="Your name" value="${escapeHtml(localStorage.getItem(COMMENT_AUTHOR_KEY) || '')}"></div><textarea rows="2" placeholder="Add a reply…"></textarea><button type="button" data-action="add-reply" class="secondary">Reply</button></div></div>
    `;
  } else {
    popover.innerHTML = `
      <p class="comment-popover-title">${existingComment ? 'View / Edit comment' : 'Add comment to bracket'}</p>
      <div class="comment-popover-author-row">
        <label for="commentAuthorBracket">Author:</label>
        <input type="text" id="commentAuthorBracket" class="author-input" placeholder="Your name" value="${escapeHtml(commentAuthor)}">
      </div>
      <textarea rows="3" placeholder="Your note on this bracket…">${escapeHtml(existingComment?.text || '')}</textarea>
      <div class="comment-popover-actions">
        <button type="button" data-action="save">${existingComment ? 'Update' : 'Save'}</button>
        ${existingComment ? '<button type="button" data-action="delete" class="secondary">Remove comment</button>' : ''}
        <button type="button" data-action="cancel" class="secondary">Cancel</button>
      </div>
      ${existingComment ? `<div class="comment-replies-section"><p class="comment-replies-title">Replies (${(existingComment.replies || []).length})</p><div class="comment-replies-list" data-comment-id="${existingComment.id}"></div><div class="comment-reply-add"><div class="comment-reply-author-row"><label for="replyAuthorBracket">Author:</label><input type="text" id="replyAuthorBracket" class="author-input" placeholder="Your name" value="${escapeHtml(localStorage.getItem(COMMENT_AUTHOR_KEY) || '')}"></div><textarea rows="2" placeholder="Add a reply…"></textarea><button type="button" data-action="add-reply" class="secondary">Reply</button></div></div>` : ''}
    `;
  }

  const wrapper = bracketCanvas?.parentElement || document.body;
  const defaultW = 640;
  const leftOffset = 120;
  const leftBelow = Math.max(8, centerX - Math.floor(defaultW / 2) - leftOffset);
  const topBelow = centerY + 20;
  popover.style.left = `${Math.max(8, Math.min(leftBelow, wrapper.offsetWidth - defaultW))}px`;
  popover.style.top = `${Math.max(8, topBelow)}px`;
  wrapper.appendChild(popover);
  if (options.lastWidth != null) popover.style.width = options.lastWidth + 'px';
  if (options.lastHeight != null) popover.style.height = options.lastHeight + 'px';
  if (options.lastLeft != null) popover.style.left = options.lastLeft;
  if (options.lastTop != null) popover.style.top = options.lastTop;
  makeCommentPopoverDraggableAndResizable(popover);

  if (viewMode) {
    popover.querySelector('[data-action="edit"]').addEventListener('click', () => {
      const lastWidth = popover.offsetWidth;
      const lastHeight = popover.offsetHeight;
      const lastLeft = popover.style.left;
      const lastTop = popover.style.top;
      popover.remove();
      document.removeEventListener('click', dismiss);
      showCommentPopoverForBracket(bracketIdx, centerY, centerX, { viewMode: false, lastWidth, lastHeight, lastLeft, lastTop });
    });
    popover.querySelector('[data-action="delete"]').addEventListener('click', () => {
      comments = comments.filter((c) => c.id !== existingComment.id);
      popover.remove();
      document.removeEventListener('click', dismiss);
      renderCommentPreviews();
      showStatus('Comment removed.', 'success');
    });
    popover.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      popover.remove();
      document.removeEventListener('click', dismiss);
    });
    const repliesList = popover.querySelector('.comment-replies-list');
    const replyCountEl = popover.querySelector('.comment-replies-title');
    const renderReplies = () => {
      if (!repliesList) return;
      repliesList.innerHTML = '';
      const replies = existingComment.replies || [];
      replyCountEl.textContent = `Replies (${replies.length})`;
      replies.forEach((r) => {
        const div = document.createElement('div');
        div.className = 'comment-reply-item';
        div.innerHTML = `<span class="comment-reply-meta">${escapeHtml(r.author || '')} · ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span><p class="comment-reply-text">${escapeHtml(r.text || '')}</p>`;
        repliesList.appendChild(div);
      });
    };
    renderReplies();
    const replyTa = popover.querySelector('.comment-reply-add textarea');
    const replyAuthorInput = popover.querySelector('#replyAuthorBracket');
    const addReplyBtn = popover.querySelector('[data-action="add-reply"]');
    if (addReplyBtn && replyTa) {
      addReplyBtn.addEventListener('click', () => {
        const replyText = (replyTa.value || '').trim();
        if (!replyText) return;
        const replyAuthor = (replyAuthorInput && replyAuthorInput.value || '').trim() || (localStorage.getItem(COMMENT_AUTHOR_KEY) || '');
        if (replyAuthor) try { localStorage.setItem(COMMENT_AUTHOR_KEY, replyAuthor); } catch (_) {}
        if (!existingComment.replies) existingComment.replies = [];
        existingComment.replies.push({
          id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
          text: replyText,
          author: replyAuthor || undefined,
          createdAt: new Date().toISOString(),
        });
        replyTa.value = '';
        renderReplies();
        renderCommentPreviews();
      });
    }
  } else {
  const ta = popover.querySelector('textarea');
  const authorInput = popover.querySelector('#commentAuthorBracket');
  ta.focus();

  if (existingComment) {
    const repliesList = popover.querySelector('.comment-replies-list');
    const replyCountEl = popover.querySelector('.comment-replies-title');
    const renderReplies = () => {
      if (!repliesList) return;
      repliesList.innerHTML = '';
      const replies = existingComment.replies || [];
      replyCountEl.textContent = `Replies (${replies.length})`;
      replies.forEach((r) => {
        const div = document.createElement('div');
        div.className = 'comment-reply-item';
        div.innerHTML = `<span class="comment-reply-meta">${escapeHtml(r.author || '')} · ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span><p class="comment-reply-text">${escapeHtml(r.text || '')}</p>`;
        repliesList.appendChild(div);
      });
    };
    renderReplies();
    const replyTa = popover.querySelector('.comment-reply-add textarea');
    const replyAuthorInput = popover.querySelector('#replyAuthorBracket');
    const addReplyBtn = popover.querySelector('[data-action="add-reply"]');
    if (addReplyBtn && replyTa) {
      addReplyBtn.addEventListener('click', () => {
        const replyText = (replyTa.value || '').trim();
        if (!replyText) return;
        const replyAuthor = (replyAuthorInput && replyAuthorInput.value || '').trim() || (localStorage.getItem(COMMENT_AUTHOR_KEY) || '');
        if (replyAuthor) try { localStorage.setItem(COMMENT_AUTHOR_KEY, replyAuthor); } catch (_) {}
        if (!existingComment.replies) existingComment.replies = [];
        existingComment.replies.push({
          id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
          text: replyText,
          author: replyAuthor || undefined,
          createdAt: new Date().toISOString(),
        });
        replyTa.value = '';
        renderReplies();
        renderCommentPreviews();
      });
    }
  }

  popover.querySelector('[data-action="save"]').addEventListener('click', () => {
    const text = (ta.value || '').trim();
    const author = (authorInput && authorInput.value || '').trim();
    if (author) try { localStorage.setItem(COMMENT_AUTHOR_KEY, author); } catch (_) {}
    let reopenViewMode = false;
    if (existingComment) {
      existingComment.text = text;
      existingComment.author = author || existingComment.author;
      if (!text) comments = comments.filter((c) => c.id !== existingComment.id);
      else reopenViewMode = true;
    } else if (text) {
      comments.push({
        id: nextCommentId(),
        type: 'bracket',
        target: { bracketIdx },
        text,
        author: author || undefined,
        createdAt: new Date().toISOString(),
        replies: [],
      });
      reopenViewMode = true;
    }
    const lastWidth = popover.offsetWidth;
    const lastHeight = popover.offsetHeight;
    const lastLeft = popover.style.left;
    const lastTop = popover.style.top;
    popover.remove();
    document.removeEventListener('click', dismiss);
    renderCommentPreviews();
    renderBrackets();
    showStatus(existingComment ? (text ? 'Comment updated.' : 'Comment removed.') : 'Comment added.', 'success');
    if (reopenViewMode) showCommentPopoverForBracket(bracketIdx, centerY, centerX, { viewMode: true, lastWidth, lastHeight, lastLeft, lastTop });
  });

  if (existingComment) {
    popover.querySelector('[data-action="delete"]').addEventListener('click', () => {
      comments = comments.filter((c) => c.id !== existingComment.id);
      popover.remove();
      document.removeEventListener('click', dismiss);
      renderCommentPreviews();
      renderBrackets();
      showStatus('Comment removed.', 'success');
    });
  }

  popover.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    popover.remove();
    document.removeEventListener('click', dismiss);
  });
  }

  const dismiss = (e) => {
    if (popover._dragJustEnded) return;
    if (popover.parentNode && popover.contains(e.target)) return;
    popover.remove();
    document.removeEventListener('click', dismiss);
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

function showBracketActions(bracketIdx, centerY, centerX) {
  connectBracketToBracketIdx = null;
  const existing = document.getElementById('bracketActions');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'bracketActions';
  popover.className = 'bracket-actions';
  const bracket = brackets[bracketIdx];
  const hasTwoLabels = !SINGLE_LABEL_TYPES.has(bracket.type);
  const hasComment = !!getCommentForBracket(bracketIdx);
  popover.innerHTML = `
    <div class="drag-handle" title="Drag to move"></div>
    <button data-action="delete">Delete</button>
    <button data-action="label">Change label</button>
    ${hasTwoLabels ? '<button data-action="swap">⇅ Swap labels</button>' : ''}
    <button data-action="select" title="Select bracket, then click a proposition to connect to (reparents) or another bracket to create bracket">Select to connect</button>
    <button data-action="comment" title="Add or view a comment on this bracket">${hasComment ? 'View comment' : 'Add comment'}</button>
  `;

  const wrapper = bracketCanvas.parentElement;
  makePopupDraggable(popover, '.drag-handle');

  popover.style.left = `${Math.max(8, Math.min(centerX - 90, wrapper.offsetWidth - 190))}px`;
  popover.style.top = `${Math.max(8, centerY - 50)}px`;
  wrapper.appendChild(popover);
  const maxTop = wrapper.offsetHeight - popover.offsetHeight - 8;
  if (parseFloat(popover.style.top) > maxTop) popover.style.top = `${maxTop}px`;

  const clearAndDismiss = () => {
    popover.remove();
    document.removeEventListener('click', dismiss);
    clearPropositionHighlights();
  };

  popover.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });
    brackets.splice(bracketIdx, 1);
    comments = comments.filter((c) => c.type !== 'bracket' || c.target?.bracketIdx !== bracketIdx);
    comments.forEach((c) => { if (c.type === 'bracket' && c.target?.bracketIdx > bracketIdx) c.target.bracketIdx--; });
    renderBrackets();
    renderCommentPreviews();
    clearAndDismiss();
    showStatus('Bracket removed.', 'success');
  });

  popover.querySelector('[data-action="label"]').addEventListener('click', (e) => {
    e.stopPropagation();
    clearAndDismiss();
    showLabelPicker(bracketIdx, centerY, centerX);
  });

  const swapBtn = popover.querySelector('[data-action="swap"]');
  if (swapBtn) {
    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });
      brackets[bracketIdx].labelsSwapped = !brackets[bracketIdx].labelsSwapped;
      renderBrackets();
      clearAndDismiss();
      showStatus('Labels swapped.', 'success');
    });
  }

  popover.querySelector('[data-action="select"]').addEventListener('click', (e) => {
    e.stopPropagation();
    popover.remove();
    document.removeEventListener('click', dismiss);
    handleBracketGroupClick(bracketIdx);
  });

  popover.querySelector('[data-action="comment"]').addEventListener('click', (e) => {
    e.stopPropagation();
    clearAndDismiss();
    showCommentPopoverForBracket(bracketIdx, centerY, centerX);
  });

  const dismiss = (e) => {
    if (popover.parentNode && popover.contains(e.target)) return;
    connectBracketToBracketIdx = null;
    clearAndDismiss();
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

function showLabelPicker(bracketIdx, centerY, centerX) {
  const existing = document.getElementById('labelPicker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'labelPicker';
  picker.className = 'label-picker relationship-picker';

  const wrapper = bracketCanvas.parentElement;
  const title = document.createElement('p');
  title.className = 'picker-title';
  title.textContent = 'Choose relationship';
  picker.appendChild(title);

  const typeKeys = Object.keys(RELATIONSHIP_TYPES).filter((k) => k !== 'action-result');
  typeKeys.forEach((typeKey) => {
    const btn = document.createElement('button');
    btn.textContent = RELATIONSHIP_TYPES[typeKey] ?? typeKey;
    btn.title = RELATIONSHIP_TYPES[typeKey];
    btn.className = typeKey;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      brackets[bracketIdx].type = typeKey;
      renderBrackets();
      picker.remove();
      document.removeEventListener('click', dismiss);
      showStatus(`Label changed to ${RELATIONSHIP_TYPES[typeKey]}`, 'success');
    });
    picker.appendChild(btn);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'secondary picker-delete-bracket';
  deleteBtn.textContent = 'Delete bracket';
  deleteBtn.title = 'Remove this bracket';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    brackets.splice(bracketIdx, 1);
    comments = comments.filter((c) => c.type !== 'bracket' || c.target?.bracketIdx !== bracketIdx);
    comments.forEach((c) => {
      if (c.type === 'bracket' && c.target?.bracketIdx > bracketIdx) c.target.bracketIdx--;
    });
    renderBrackets();
    renderCommentPreviews();
    picker.remove();
    document.removeEventListener('click', dismiss);
    showStatus('Bracket removed.', 'success');
  });
  picker.appendChild(deleteBtn);

  picker.style.left = `${Math.max(8, Math.min(centerX - 210, wrapper.offsetWidth - 430))}px`;
  picker.style.top = `${Math.max(8, centerY - 130)}px`;
  wrapper.appendChild(picker);
  makePopupDraggable(picker, '.picker-title');

  const maxTop = wrapper.offsetHeight - picker.offsetHeight - 8;
  if (parseFloat(picker.style.top) > maxTop) picker.style.top = `${maxTop}px`;

  const dismiss = (e) => {
    if (picker.parentNode && picker.contains(e.target)) return;
    picker.remove();
    document.removeEventListener('click', dismiss);
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

// New bracket: prompt to save current, then start fresh
function startNewBracket() {
  passageRef = '—';
  propositions = [];
  verseRefs = [];
  brackets = [];
  formatTags = [];
  wordArrows = [];
  undoStack = [];
  comments = [];
  bracketSelectStep = 0;
  bracketFrom = null;
  connectBracketToBracketIdx = null;
  clearPropositionHighlights();
  if (passageHeader) passageHeader.textContent = passageRef;
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel) copyrightLabel.textContent = '(ESV)';
  if (propositionsContainer) propositionsContainer.classList.remove('greek-text');
  renderPropositions();
  renderBrackets();
  document.getElementById('bracketActions')?.remove();
  document.getElementById('labelPicker')?.remove();
  document.getElementById('commentPopover')?.remove();
  renderCommentPreviews();
  showStatus('New bracket started. Fetch or import a passage to begin.', 'success');
}

async function handleNewBracket() {
  const hasContent = propositions.length > 0 && propositions.some((p) => p && p.trim() && p !== '(empty)');
  if (!hasContent) {
    startNewBracket();
    return;
  }
  const wrapper = bracketCanvas?.parentElement || document.body;
  const dialog = document.createElement('div');
  dialog.className = 'label-picker new-bracket-dialog';
  dialog.innerHTML = `
    <p class="picker-title">Save current bracket before starting new?</p>
    <div class="new-bracket-buttons">
      <button type="button" data-action="save">Save</button>
      <button type="button" data-action="discard" class="secondary">Discard</button>
      <button type="button" data-action="cancel" class="secondary">Cancel</button>
    </div>
  `;
  const w = wrapper.offsetWidth || 400;
  const h = wrapper.offsetHeight || 300;
  dialog.style.left = `${Math.max(8, w / 2 - 120)}px`;
  dialog.style.top = `${Math.max(8, h / 2 - 55)}px`;
  wrapper.appendChild(dialog);

  const cleanup = () => {
    dialog.remove();
    document.removeEventListener('click', dismiss);
  };

  const dismiss = (e) => {
    if (dialog.contains(e.target)) return;
    cleanup();
  };

  return new Promise((resolve) => {
    dialog.querySelector('[data-action="save"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      cleanup();
      try {
        await saveBracket();
        startNewBracket();
      } catch (_) {
        showStatus('Save cancelled.', 'error');
      }
      resolve();
    });
    dialog.querySelector('[data-action="discard"]').addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
      startNewBracket();
      resolve();
    });
    dialog.querySelector('[data-action="cancel"]').addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
      resolve();
    });
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });
}

// New Bracket listener logic already handled elsewhere
if (newBracketBtn) newBracketBtn.addEventListener('click', () => handleNewBracket());

// Clear brackets
if (clearBracketsBtn) clearBracketsBtn.addEventListener('click', () => {
  if (brackets.length === 0) return;
  undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map((a) => ({ ...a })), formatTags: formatTags.map((t) => ({ ...t })), wordArrows: wordArrows.map(w => ({...w})) });
  brackets = [];
  renderBrackets();
  bracketSelectStep = 0;
  bracketFrom = null;
  clearPropositionHighlights();
  showStatus('All brackets cleared.', 'success');
});

// Import pasted text
function parsePastedText(raw, defaultStartVerse = '1') {
  const verseParts = raw.split(/(?=\[\d+(?::\d+)?\])/);
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

if (importBtn) importBtn.addEventListener('click', () => {
  if (!pasteText) return;
  const raw = pasteText.value.trim();
  if (!raw) {
    showStatus('Paste some text first.', 'error');
    return;
  }

  // Try to parse as exported JSON bracket text
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && Array.isArray(data.propositions)) {
      importBracket(data);
      pasteText.value = '';
      return;
    }
  } catch (e) {
    // Normal text parsing continues below if it's not JSON
  }
  const passageRefInput = document.getElementById('importPassageRef');
  const startVerseInput = document.getElementById('importStartVerse');
  const startVerse = (startVerseInput?.value?.trim() || '1').replace(/[^0-9a-z:]/gi, '') || '1';

  const parsed = parsePastedText(raw, startVerse);
  if (parsed.propositions.length > 0) {
    propositions = parsed.propositions;
    verseRefs = parsed.verseRefs;
  } else {
    propositions = [raw.replace(/\[\d+(?::\d+)?\]\s*/g, '').trim() || raw];
    verseRefs = [startVerse];
  }
  passageRef = passageRefInput?.value?.trim() || 'Imported text';
  if (passageHeader) passageHeader.textContent = passageRef;
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel) copyrightLabel.textContent = '';
  if (propositionsContainer) propositionsContainer.classList.remove('greek-text');
  undoStack = [];
  renderPropositions();
  brackets = [];
  renderBrackets();
  showStatus('Imported. Double-click in text to split / single click to edit. Use nodes or verse refs for brackets.', 'success');
});

// Export / Import bracket as JSON file + Recent list
const recentListEl = document.getElementById('recentList');

const RECENT_KEY = 'biblebracket_recent';
const RECENT_MAX = 10;

function getRecentBrackets() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentBrackets(items) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_MAX)));
  } catch (e) {
    console.warn('Could not save recent brackets:', e);
  }
}

function addToRecent(data) {
  const items = getRecentBrackets();
  const label = data.passageRef || 'Imported bracket';
  const existing = items.findIndex((i) => (i.passageRef || i.data?.passageRef) === label);
  const entry = { passageRef: label, data, accessedAt: Date.now() };
  const next = existing >= 0
    ? [entry, ...items.slice(0, existing), ...items.slice(existing + 1)]
    : [entry, ...items];
  saveRecentBrackets(next);
  renderRecentList();
}

function renderRecentList() {
  if (!recentListEl) return;
  const items = getRecentBrackets();
  recentListEl.innerHTML = '';
  items.forEach((item, idx) => {
    const li = document.createElement('li');
    const label = item.passageRef || item.data?.passageRef || 'Bracket';
    li.innerHTML = `<button type="button" class="recent-item" data-idx="${idx}" title="Load this bracket">${escapeHtml(label)}</button>`;
    li.querySelector('button').addEventListener('click', () => {
      const bracket = getRecentBrackets()[idx];
      if (bracket?.data) importBracket(bracket.data);
    });
    recentListEl.appendChild(li);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function nextCommentId() {
  return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function getBookAbbreviation(bookName) {
  const map = {
    'genesis': 'gen', 'exodus': 'exod', 'leviticus': 'lev', 'numbers': 'num', 'deuteronomy': 'deut',
    'joshua': 'josh', 'judges': 'judg', 'ruth': 'ruth', '1 samuel': '1sam', '2 samuel': '2sam',
    '1 kings': '1kgs', '2 kings': '2kgs', '1 chronicles': '1chr', '2 chronicles': '2chr',
    'ezra': 'ezra', 'nehemiah': 'neh', 'esther': 'esth', 'job': 'job', 'psalm': 'ps', 'psalms': 'ps',
    'proverbs': 'prov', 'ecclesiastes': 'eccl', 'song of solomon': 'song', 'isaiah': 'isa',
    'jeremiah': 'jer', 'lamentations': 'lam', 'ezekiel': 'ezek', 'daniel': 'dan',
    'hosea': 'hos', 'joel': 'joel', 'amos': 'amos', 'obadiah': 'obad', 'jonah': 'jonah',
    'micah': 'mic', 'nahum': 'nah', 'habakkuk': 'hab', 'zephaniah': 'zeph', 'haggai': 'hag',
    'zechariah': 'zech', 'malachi': 'mal',
    'matthew': 'matt', 'mark': 'mark', 'luke': 'luke', 'john': 'john', 'acts': 'acts',
    'romans': 'rom', '1 corinthians': '1cor', '2 corinthians': '2cor', 'galatians': 'gal',
    'ephesians': 'eph', 'philippians': 'phil', 'colossians': 'col', '1 thessalonians': '1thess',
    '2 thessalonians': '2thess', '1 timothy': '1tim', '2 timothy': '2tim', 'titus': 'titus',
    'philemon': 'phlm', 'hebrews': 'heb', 'james': 'jas', '1 peter': '1pet', '2 peter': '2pet',
    '1 john': '1john', '2 john': '2john', '3 john': '3john', 'jude': 'jude', 'revelation': 'rev'
  };
  const normalized = bookName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  return map[normalized] || normalized.replace(/\s+/g, '').substring(0, 3);
}

function getExportFilename(defaultOnly = false) {
  const customInput = document.getElementById('exportFilename');
  if (!defaultOnly && customInput && customInput.value.trim()) {
    return customInput.value.trim();
  }
  
  const ref = passageRef || 'passage';
  // Normalize dashes (em-dash, en-dash) to regular hyphen for parsing
  const normalizedRef = ref.replace(/[\u2013\u2014]/g, '-');
  const match = normalizedRef.match(/^([\d\s]*[a-zA-Z][a-zA-Z\s.]*[a-zA-Z])\s+(\d+)(?::(\d+)(?:-(\d+))?)?/);
  let defaultPassagePrefix = ref.replace(/[\s:]+/g, '-');
  
  if (match) {
    const book = getBookAbbreviation(match[1]);
    const chap = match[2];
    const sv = match[3] || '1';
    const ev = match[4] || sv;
    defaultPassagePrefix = `${book}-${chap}-${sv}-${ev}`;
  }
  
  let authorPart = 'unknown';
  const authorName = (document.getElementById('pageAuthor')?.value || '').trim();
  if (authorName) {
    const parts = authorName.trim().split(/\s+/);
    if (parts.length > 1) {
      const last = parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
      const firstInitial = parts[0].charAt(0).toLowerCase();
      authorPart = `${last}${firstInitial}`;
    } else {
      authorPart = authorName.toLowerCase().replace(/[^a-z]/g, '');
    }
  }

  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;

  let translation = 'esv';
  const versionSelect = document.getElementById('versionSelect');
  if (versionSelect) {
    translation = versionSelect.value || 'esv';
  }

  return `${defaultPassagePrefix}.${translation}.${authorPart}.${datePart}`;
}

function updateFilenamePlaceholder() {
  const input = document.getElementById('exportFilename');
  if (input) {
    input.placeholder = getExportFilename(true);
  }
}

function buildBracketData() {
  return {
    version: 1,
    passageRef,
    propositions,
    verseRefs,
    brackets: brackets.map((a) => ({ ...a })),
    formatTags: formatTags.map((t) => ({ ...t })),
    wordArrows: wordArrows.map((w) => ({ ...w })),
    comments: comments.map((c) => ({ ...c })),
    copyrightLabel: document.getElementById('copyrightLabel')?.textContent || '',
    pageAuthor: (document.getElementById('pageAuthor')?.value || '').trim(),
    exportedAt: new Date().toISOString(),
  };
}

let saveFileHandle = null;

async function saveBracket() {
  if (propositions.length === 0) {
    showStatus('Nothing to save. Fetch or import a passage first.', 'error');
    return;
  }
  const data = buildBracketData();
  const json = JSON.stringify(data, null, 2);

  // Fallback for local files where File System Access API is blocked
  const isLocalFile = window.location.protocol === 'file:';

  try {
    if (!isLocalFile && saveFileHandle && 'createWritable' in saveFileHandle) {
      const writable = await saveFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      addToRecent(data);
      showStatus('Saved.', 'success');
    } else if (!isLocalFile && 'showSaveFilePicker' in window) {
      const name = `${getExportFilename()}.json`;
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      saveFileHandle = handle;
      addToRecent(data);
      showStatus('Saved.', 'success');
    } else {
      exportBracket();
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      console.warn('File System Access API blocked, falling back to download:', err);
      exportBracket();
      return;
    }
    showStatus(err.message || 'Save failed.', 'error');
  }
}

async function saveBracketAs() {
  if (propositions.length === 0) {
    showStatus('Nothing to save. Fetch or import a passage first.', 'error');
    return;
  }
  const data = buildBracketData();
  const json = JSON.stringify(data, null, 2);
  const isLocalFile = window.location.protocol === 'file:';

  try {
    if (!isLocalFile && 'showSaveFilePicker' in window) {
      const name = `${getExportFilename()}.json`;
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      saveFileHandle = handle;
      addToRecent(data);
      showStatus('Saved as new file.', 'success');
    } else {
      exportBracket();
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      console.warn('File System Access API blocked, falling back to download:', err);
      exportBracket();
      return;
    }
    showStatus(err.message || 'Save failed.', 'error');
  }
}

function exportBracket() {
  if (propositions.length === 0) {
    showStatus('Nothing to export. Fetch or import a passage first.', 'error');
    return;
  }
  const data = buildBracketData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const name = `${getExportFilename()}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  addToRecent(data);
  showStatus('Bracket exported.', 'success');
}

function importBracket(data) {
  if (!data || !Array.isArray(data.propositions)) {
    showStatus('Invalid bracket file.', 'error');
    return;
  }
  passageRef = data.passageRef || 'Imported bracket';
  propositions = data.propositions.slice();
  verseRefs = Array.isArray(data.verseRefs) && data.verseRefs.length === propositions.length
    ? data.verseRefs.slice()
    : propositions.map((_, i) => String(i + 1));
  brackets = (Array.isArray(data.brackets) ? data.brackets : (Array.isArray(data.arcs) ? data.arcs : [])).map((a) => ({ ...a }));
  formatTags = Array.isArray(data.formatTags) ? data.formatTags.map((t) => ({ ...t })) : [];
  wordArrows = Array.isArray(data.wordArrows) ? data.wordArrows.map((w) => ({ ...w })) : [];
  comments = Array.isArray(data.comments) ? data.comments.map((c) => {
    // Backward compatibility for arcIdx target
    let target = { ...(c.target || {}) };
    if (target.arcIdx !== undefined) {
      target.bracketIdx = target.arcIdx;
      delete target.arcIdx;
    }
    return { ...c, target, replies: Array.isArray(c.replies) ? c.replies.map((r) => ({ ...r })) : [] };
  }) : [];

  if (passageHeader) passageHeader.textContent = passageRef;
  const pageAuthorInputEl = document.getElementById('pageAuthor');
  if (pageAuthorInputEl && data.pageAuthor != null) {
    pageAuthorInputEl.value = data.pageAuthor;
    try { localStorage.setItem(PAGE_AUTHOR_KEY, String(data.pageAuthor).trim()); } catch (_) {}
  }
  if (typeof syncPassageAuthorDisplay === 'function') syncPassageAuthorDisplay();
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel && data.copyrightLabel) copyrightLabel.textContent = data.copyrightLabel;
  if (propositionsContainer) {
    propositionsContainer.classList.toggle('greek-text', !!data.copyrightLabel?.includes('SBL'));
  }
  undoStack = [];
  bracketSelectStep = 0;
  bracketFrom = null;
  clearPropositionHighlights();
  renderPropositions();
  renderBrackets();
  renderCommentPreviews();
  addToRecent(data);
  showStatus('Bracket loaded.', 'success');
}

async function copyDiagramForWord() {
  const workspace = document.querySelector('.workspace');
  if (!workspace) {
    showStatus('Nothing to copy.', 'error');
    return;
  }
  if (propositions.length === 0) {
    showStatus('Nothing to copy. Fetch or import a passage first.', 'error');
    return;
  }
  if (typeof html2canvas !== 'function') {
    showStatus('Copy failed: html2canvas not loaded.', 'error');
    return;
  }
  try {
    // Calculate bounding box of all content within the workspace to crop out empty space
    const workspaceRect = workspace.getBoundingClientRect();
    
    // Elements that MUST be visible (propositions and brackets)
    const coreElements = [
      ...Array.from(workspace.querySelectorAll('.proposition-text')),
      ...Array.from(workspace.querySelectorAll('#bracketCanvas path, #bracketCanvas circle, #bracketCanvas text'))
    ];

    // Elements that are NICE to have (header info) but shouldn't stretch the width excessively
    const infoElements = [
      workspace.querySelector('#passageRef'),
      workspace.querySelector('#copyrightLabel')
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;

    // First pass: Essential content
    coreElements.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
        found = true;
      }
    });

    // Second pass: Info elements (allow them to expand vertically, but be cautious with width)
    infoElements.forEach((el) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        // We only let info elements expand the MaxX if they aren't far to the right
        // compared to our core content (to avoid catching far-right names)
        if (found) {
          if (r.right < maxX + 500) {
            maxX = Math.max(maxX, r.right);
          }
        } else {
          maxX = Math.max(maxX, r.right);
        }
        maxY = Math.max(maxY, r.bottom);
        found = true;
      }
    });

    const padding = 16;
    let options = {
      useCORS: true,
      scale: 2,
      backgroundColor: null,
      logging: false,
    };

    if (found) {
      // Convert to relative coordinates within workspace
      const x = Math.max(0, minX - workspaceRect.left - padding);
      const y = Math.max(0, minY - workspaceRect.top - padding);
      const width = Math.min(workspaceRect.width, (maxX - minX) + (padding * 2));
      const height = Math.min(workspaceRect.height, (maxY - minY) + (padding * 2));
      
      options.x = x;
      options.y = y;
      options.width = width;
      options.height = height;
    }

    const canvas = await html2canvas(workspace, options);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showStatus('Copy failed.', 'error');
        return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showStatus('Diagram copied. Paste into Word with Ctrl+V (or Cmd+V).', 'success');
      } catch (err) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${getExportFilename()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus('Clipboard blocked. Image downloaded instead—insert into Word.', 'success');
      }
    }, 'image/png');
  } catch (err) {
    showStatus(err.message || 'Copy failed.', 'error');
  }
}

if (copyForWordBtn) copyForWordBtn.addEventListener('click', copyDiagramForWord);

if (copyDataBtn) {
  copyDataBtn.addEventListener('click', async () => {
    if (propositions.length === 0) {
      showStatus('Nothing to copy. Fetch or import a passage first.', 'error');
      return;
    }
    const data = buildBracketData();
    try {
      await navigator.clipboard.writeText(JSON.stringify(data));
      showStatus('Bracket data copied to clipboard. Paste into the "Paste passage text" box to import elsewhere.', 'success');
    } catch (err) {
      showStatus('Could not access clipboard. Please use Export instead.', 'error');
    }
  });
}

if (saveBtn) saveBtn.addEventListener('click', () => saveBracket());
if (saveAsBtn) saveAsBtn.addEventListener('click', () => saveBracketAs());

async function openBracketFile() {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      saveFileHandle = handle;
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      importBracket(data);
    } catch (err) {
      if (err.name !== 'AbortError') showStatus(err.message || 'Could not open file.', 'error');
    }
  } else {
    importFileInput?.click();
  }
}

if (openFileBtn) openFileBtn.addEventListener('click', openBracketFile);

if (importFileInput) {
  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importBracket(data);
      } catch {
        showStatus('Could not parse file.', 'error');
      }
    };
    reader.readAsText(file);
    importFileInput.value = '';
  });
}

renderRecentList();
renderCommentPreviews();

// Update filename placeholder logic
if (passageHeader) {
  const obs = new MutationObserver(updateFilenamePlaceholder);
  obs.observe(passageHeader, { childList: true, characterData: true, subtree: true });
}
const pageAuthorInputForFilename = document.getElementById('pageAuthor');
if (pageAuthorInputForFilename) {
  pageAuthorInputForFilename.addEventListener('input', updateFilenamePlaceholder);
}
const versionSelectForFilename = document.getElementById('versionSelect');
if (versionSelectForFilename) {
  versionSelectForFilename.addEventListener('change', updateFilenamePlaceholder);
}
// Init placeholder
updateFilenamePlaceholder();

// Comment and Text Edit mode toggles
const textEditModeBtn = document.getElementById('textEditModeBtn');
const commentModeBtn = document.getElementById('commentModeBtn');
const arrowModeBtn = document.getElementById('arrowModeBtn');

function getWordAtEvent(e) {
  let range;
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (!pos || pos.offsetNode.nodeType !== Node.TEXT_NODE) return null;
    range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
  } else if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(e.clientX, e.clientY);
  }
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const node = range.startContainer;
  const text = node.textContent;
  const offset = range.startOffset;

  let start = offset, end = offset;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;

  if (start === end) return null;

  // Find line-relative offset
  let block = node.parentElement;
  while (block && !block.classList.contains('proposition-block')) block = block.parentElement;
  if (!block) return null;

  const propIndex = parseInt(block.dataset.index);
  const textSpan = block.querySelector('.proposition-text');
  
  // Calculate offset relative to entire text in proposition-text
  // We can use a range from start of textSpan to start of our node
  const preRange = document.createRange();
  preRange.setStartBefore(textSpan.firstChild);
  preRange.setEnd(node, start);
  const relativeStart = preRange.toString().length;
  
  preRange.setEnd(node, end);
  const relativeEnd = preRange.toString().length;

  range.setStart(node, start);
  range.setEnd(node, end);
  const rect = range.getBoundingClientRect();

  return { propIndex, start: relativeStart, end: relativeEnd, rect };
}

if (textEditModeBtn) {
  textEditModeBtn.addEventListener('click', () => {
    textEditMode = !textEditMode;
    textEditModeBtn.classList.toggle('active', textEditMode);
    document.body.classList.toggle('text-edit-mode-active', textEditMode);
    textEditModeBtn.title = textEditMode ? 'Text edit mode on: edit text directly, use Tab for indent, Enter for newlines.' : 'Toggle text edit mode: edit text freely with newlines and indentation. No brackets or dividing.';
    if (textEditMode) {
      if (commentMode) commentModeBtn?.click();
      if (arrowMode) arrowModeBtn?.click();
      bracketCanvas?.classList.remove('connect-mode');
      bracketSelectStep = 0;
      bracketFrom = null;
      if (typeof clearPropositionHighlights === 'function') clearPropositionHighlights();
      showStatus('Text Edit mode on. Brackets disabled; Enter adds linebreaks, Tab indents.', 'success');
    } else {
      showStatus('Text Edit mode off.', 'success');
    }
  });
}

if (commentModeBtn) {
  commentModeBtn.addEventListener('click', () => {
    commentMode = !commentMode;
    commentModeBtn.classList.toggle('active', commentMode);
    commentModeBtn.title = commentMode ? 'Comment mode on: highlight text to add a comment, or click a bracket and choose Add comment' : 'Toggle comment mode';
    if (commentMode) {
      if (textEditMode) textEditModeBtn?.click();
      if (arrowMode) arrowModeBtn?.click();
      bracketCanvas?.classList.remove('connect-mode');
      bracketSelectStep = 0;
      bracketFrom = null;
      if (typeof clearPropositionHighlights === 'function') clearPropositionHighlights();
      showStatus(commentMode ? 'Comment mode on. Highlight text or click a bracket to add a comment.' : 'Comment mode off.', 'success');
    } else {
      showStatus('Comment mode off.', 'success');
    }
  });
}

if (arrowModeBtn) {
  arrowModeBtn.addEventListener('click', () => {
    arrowMode = !arrowMode;
    arrowModeBtn.classList.toggle('active', arrowMode);
    if (arrowMode) {
      if (textEditMode) textEditModeBtn?.click();
      if (commentMode) commentModeBtn?.click();
      pendingArrowStart = null;
      showStatus('Arrow mode on. Click a word to start, then another word to finish.', 'success');
    } else {
      if (arrowHighlight) arrowHighlight.remove();
      arrowHighlight = null;
      pendingArrowStart = null;
      showStatus('Arrow mode off.', 'success');
    }
  });
}

// Text selection and word arrow interaction
if (propositionsContainer) {
  propositionsContainer.addEventListener('mousemove', (e) => {
    if (!arrowMode) return;
    const word = getWordAtEvent(e);
    if (word) {
      if (!arrowHighlight) {
        arrowHighlight = document.createElement('div');
        arrowHighlight.className = 'word-highlight-overlay';
        document.body.appendChild(arrowHighlight);
      }
      arrowHighlight.style.left = word.rect.left + window.scrollX + 'px';
      arrowHighlight.style.top = word.rect.top + window.scrollY + 'px';
      arrowHighlight.style.width = word.rect.width + 'px';
      arrowHighlight.style.height = word.rect.height + 'px';
      arrowHighlight.style.display = 'block';
      arrowHighlight.classList.toggle('pending', pendingArrowStart !== null);
    } else {
      if (arrowHighlight) arrowHighlight.style.display = 'none';
    }
  });

  propositionsContainer.addEventListener('mouseleave', () => {
    if (arrowHighlight) arrowHighlight.style.display = 'none';
  });

  propositionsContainer.addEventListener('mousedown', (e) => {
    if (!arrowMode) return;
    const word = getWordAtEvent(e);
    if (!word) return;

    if (!pendingArrowStart) {
      pendingArrowStart = word;
      showStatus('Start word selected. Now click the target word.', 'success');
    } else {
      if (pendingArrowStart.propIndex === word.propIndex && pendingArrowStart.start === word.start) {
        pendingArrowStart = null;
        showStatus('Arrow cancelled.', 'info');
        return;
      }
      undoStack.push({ action: 'add arrow', propositions: propositions.slice(), verseRefs: verseRefs.slice(), brackets: brackets.map(a => ({...a})), formatTags: formatTags.map(f => ({...f})), wordArrows: wordArrows.map(w => ({...w})) });
      wordArrows.push({
        fromProp: pendingArrowStart.propIndex,
        fromStart: pendingArrowStart.start,
        fromEnd: pendingArrowStart.end,
        toProp: word.propIndex,
        toStart: word.start,
        toEnd: word.end
      });
      pendingArrowStart = null;
      renderPropositions();
      renderBrackets();
      showStatus('Arrow created.', 'success');
    }
  });

  propositionsContainer.addEventListener('mouseup', () => {
    if (arrowMode) return;
    if (!commentMode || propositions.length === 0) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let startNode = range.startContainer;
    if (startNode.nodeType === Node.TEXT_NODE) startNode = startNode.parentElement;
    const textSpan = startNode.closest?.('.proposition-text');
    if (!textSpan) return;
    const block = textSpan.closest('.proposition-block');
    const propIndex = parseInt(block.dataset.index, 10);
    const preStart = document.createRange();
    preStart.setStart(textSpan, 0);
    preStart.setEnd(range.startContainer, range.startOffset);
    const start = preStart.toString().length;
    const preEnd = document.createRange();
    preEnd.setStart(textSpan, 0);
    preEnd.setEnd(range.endContainer, range.endOffset);
    const fullText = textSpan.textContent || '';
    let end = Math.min(preEnd.toString().length, fullText.length);
    if (start >= end) return;
    const anchorRect = range.getBoundingClientRect();
    setTimeout(() => showCommentPopoverForText(propIndex, start, end, null, { anchorRect }), 10);
  });

  propositionsContainer.addEventListener('click', (e) => {
    const mark = e.target.closest('.comment-highlight');
    if (!mark || !mark.dataset.commentId) return;
    e.preventDefault();
    e.stopPropagation();
    const c = getCommentById(mark.dataset.commentId);
    if (!c || !c.target) return;
    showCommentPopoverForText(c.target.propIndex, c.target.start, c.target.end, c.id);
  });
}

// Fetch button
if (fetchBtn) fetchBtn.addEventListener('click', fetchPassage);

if (passageInput) passageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchPassage();
});

// Resize observer for bracket redraw
if (propositionsContainer?.parentElement) {
  const resizeObserver = new ResizeObserver(() => updateBracketPositions());
  resizeObserver.observe(propositionsContainer.parentElement);
}

// Initial placeholder (when no passage yet)
const propEditor = document.getElementById('propositionEditor');
if (propEditor) propEditor.placeholder = 'Fetch or import a passage, then use Divide mode to click and split the text.';

// Sidebar Toggles
const toggleLeftSidebarBtn = document.getElementById('toggleLeftSidebarBtn');
const toggleRightSidebarBtn = document.getElementById('toggleRightSidebarBtn');
const leftSidebar = document.querySelector('.bracket-types');
const rightSidebar = document.querySelector('.comments-preview');

if (toggleLeftSidebarBtn && leftSidebar) {
  toggleLeftSidebarBtn.addEventListener('click', () => {
    leftSidebar.classList.toggle('sidebar-hidden');
    toggleLeftSidebarBtn.classList.toggle('flipped');
  });
}

if (toggleRightSidebarBtn && rightSidebar) {
  toggleRightSidebarBtn.addEventListener('click', () => {
    rightSidebar.classList.toggle('sidebar-hidden');
    toggleRightSidebarBtn.classList.toggle('flipped');
  });
}

// Update filename placeholder logic
function attachFilenameObservers() {
  const pRef = document.getElementById('passageRef');
  const pAuthor = document.getElementById('pageAuthor');
  
  if (pRef) {
    const obs = new MutationObserver(updateFilenamePlaceholder);
    obs.observe(pRef, { childList: true, characterData: true, subtree: true });
    pRef.addEventListener('input', updateFilenamePlaceholder);
  }
  if (pAuthor) {
    pAuthor.addEventListener('input', updateFilenamePlaceholder);
  }
  updateFilenamePlaceholder();
}
attachFilenameObservers();
