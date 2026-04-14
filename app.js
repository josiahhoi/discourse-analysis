/**
 * Bible Arc — Proposition arcing tool with ESV API and SBL Greek NT integration
 * Fetches passages, splits into propositions, draws logic arcs between them.
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
let arcs = [];
let arcSelectStep = 0;
let arcFrom = null; // { type: 'single', index } or { type: 'range', from, to }
let connectBracketToArcIdx = null; // when set, next proposition click is the reparent target
let _connectCancelListener = null;
let undoStack = []; // { action: 'divide'|'bracket', propositions, verseRefs, arcs } snapshots
let comments = []; // { id, type: 'bracket'|'text', target: { arcIdx }|{ propIndex, start, end }, text, author?, createdAt, replies?: { id, text, author?, createdAt }[] }
let isRenderingPropositions = false; // true during renderPropositions so focusout doesn't overwrite (Electron)
let commentMode = false;
let textEditMode = false;

// DOM
const passageInput = document.getElementById('passageInput');
const fetchBtn = document.getElementById('fetchBtn');
const apiKeyInput = document.getElementById('apiKey');
const passageRefEl = document.getElementById('passageRef');
const passageHeader = passageRefEl;
if (passageRefEl) {
  const syncPassageRef = () => {
    const val = (passageRefEl.textContent || '').trim();
    passageRef = val || passageRef || '—';
    if (!val) passageRefEl.textContent = passageRef;
  };
  passageRefEl.addEventListener('blur', syncPassageRef);
  passageRefEl.addEventListener('input', syncPassageRef);
}
const propositionEditor = document.getElementById('propositionEditor');
const propositionsContainer = document.getElementById('propositions');
const arcCanvas = document.getElementById('arcCanvas');
const clearArcsBtn = document.getElementById('clearArcs');

// Load API key from localStorage
if (apiKeyInput) {
  const defaultEsvKey = 'Token c8ccaec8888bfa568c00c545383a7cd28b056af3';
  apiKeyInput.value = localStorage.getItem('biblearc_esv_api_key') || defaultEsvKey;
  apiKeyInput.addEventListener('change', () => {
    localStorage.setItem('biblearc_esv_api_key', apiKeyInput.value);
  });
}

// Version selector: show/hide API key row for SBLGNT (no key needed)
const versionSelect = document.getElementById('versionSelect');
const apiKeyRow = document.getElementById('apiKeyRow');
function updateApiKeyVisibility() {
  if (apiKeyRow && versionSelect) {
    apiKeyRow.style.display = versionSelect.value === 'sblgnt' ? 'none' : '';
  }
}
if (versionSelect) {
  versionSelect.addEventListener('change', updateApiKeyVisibility);
  updateApiKeyVisibility();
}

// Theme toggle (light/dark)
const THEME_KEY = 'biblearc_theme';
const COMMENT_AUTHOR_KEY = 'biblearc_comment_author';
const PAGE_AUTHOR_KEY = 'biblearc_page_author';
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

// Page/arc author (persisted in localStorage, included in saved/exported arc, shown top-right in workspace for export/copy)
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

// 18 Logical Relationships (BibleArc) - type key -> display label
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
  'negative-positive': 'Negative-Positive (✓)',
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
    saveArc();
  }
}, true);

function formatArcType(type) {
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
    arcs = [];
    renderArcs();
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
    arcCanvas.innerHTML = '';
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
    const textComments = comments.filter((c) => c.type === 'text' && c.target && c.target.propIndex === i).sort((a, b) => (a.target.start - b.target.start));
    if (textComments.length === 0) {
      textSpan.textContent = text;
    } else {
      let pos = 0;
      for (const c of textComments) {
        const s = Math.max(pos, c.target.start);
        const e = Math.min(text.length, c.target.end);
        if (s < e) {
          if (s > pos) textSpan.appendChild(document.createTextNode(text.slice(pos, s)));
          const mark = document.createElement('mark');
          mark.className = 'comment-highlight';
          mark.dataset.commentId = c.id;
          mark.textContent = text.slice(s, e);
          mark.addEventListener('mouseenter', () => {
            const card = document.querySelector(`.comments-preview-card[data-comment-id="${c.id}"]`);
            if (card) {
              card.classList.add('comment-hover-active');
              card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
          mark.addEventListener('mouseleave', () => {
            document.querySelectorAll('.comments-preview-card.comment-hover-active').forEach(c => c.classList.remove('comment-hover-active'));
          });
          textSpan.appendChild(mark);
          pos = e;
        }
      }
      if (pos < text.length) textSpan.appendChild(document.createTextNode(text.slice(pos)));
    }
    block.appendChild(refSpan);
    block.appendChild(textSpan);

    let textBeforeEdit = null;
    block.addEventListener('focusin', () => {
      textBeforeEdit = propositions[i];
    });

    block.addEventListener('input', () => {
      updateArcPositions();
    });

    block.addEventListener('focusout', () => {
      if (isRenderingPropositions || !block.isConnected || !propositionsContainer?.contains(block)) return; // Don't overwrite during re-render (Electron) or when block was removed
      
      let currentText;
      if (textEditMode) {
        currentText = (block.querySelector('.proposition-text')?.innerText ?? '').replace(/\n$/, '') || '(empty)';
      } else {
        currentText = (block.querySelector('.proposition-text')?.textContent ?? '').trim() || '(empty)';
      }

      if (textBeforeEdit !== null && currentText !== textBeforeEdit) {
        undoStack.push({ action: 'text edit', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });
      }
      propositions[i] = currentText;
    });

    block.addEventListener('keydown', (e) => {
      if (textEditMode) {
        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand('insertText', false, '\t');
        }
        return; // Allow Enter and text to be natively edited, do not divide
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
      if (connectBracketToArcIdx !== null) {
        idx = getPropositionIndexAtPoint(e.clientX, e.clientY);
        if (idx < 0) idx = parseInt(block.dataset.index, 10);
      } else {
        idx = parseInt(block.dataset.index, 10);
      }
      const inBracketFlow = arcSelectStep === 1 || connectBracketToArcIdx !== null;
      if (inBracketFlow || !clickedText) {
        handlePropositionClick(idx);
      }
    });

    propositionsContainer.appendChild(block);
  });

  updateArcPositions();
  // Restore scroll after layout (and ResizeObserver-triggered renderArcs) to prevent jump
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      restoreScrollState(scrollState);
      isRenderingPropositions = false;
    });
  });
}

// Resolve proposition index at viewport coordinates (for Connect-to mode; avoids arc overlay / boundary issues)
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
  const candidates = arcs
    .map((arc, idx) => ({ arc, idx }))
    .filter(({ arc }) => arc.from <= index && index <= arc.to && arc.from !== arc.to);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.arc.to - a.arc.from) - (b.arc.to - b.arc.from));
  return candidates[0].idx;
}

// Reparent a bracket so it is "connected to" target proposition; refactors containing arcs so slots update.
function reparentBracketToProposition(arcIdx, targetIndex) {
  if (arcIdx < 0 || arcIdx >= arcs.length) return;
  const arc = arcs[arcIdx];
  const from = arc.from;
  const to = arc.to;
  const P = targetIndex;

  if (P >= from && P <= to) {
    showStatus('Choose a proposition outside this bracket to connect to.', 'error');
    return;
  }

  undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });

  // Shrink any arc that contains [from, to] (spans past at least one end) so it no longer contains it (cut at P).
  arcs.forEach((a, i) => {
    if (i === arcIdx) return;
    const contains = a.from <= from && a.to >= to && (a.from < from || a.to > to);
    if (!contains) return;
    if (P < from) {
      a.to = P;
    } else {
      a.from = P;
    }
  });

  // Remove the arc we're reparenting (replace it with the new span).
  arcs.splice(arcIdx, 1);

  // Remove arcs that became invalid (from >= to).
  for (let i = arcs.length - 1; i >= 0; i--) {
    if (arcs[i].from >= arcs[i].to) arcs.splice(i, 1);
  }

  // Add a new arc that spans from P to this bracket, so the bracket becomes a direct child of P.
  const newFrom = Math.min(P, from);
  const newTo = Math.max(P, to);
  arcs.push({ from: newFrom, to: newTo, type: arc.type, labelsSwapped: arc.labelsSwapped ?? false });

  renderArcs();
  showStatus('Bracket connected. Nesting and slots updated.', 'success');
}

function handlePropositionClick(index) {
  if (connectBracketToArcIdx !== null) {
    reparentBracketToProposition(connectBracketToArcIdx, index);
    connectBracketToArcIdx = null;
    arcCanvas?.classList.remove('connect-mode');
    if (_connectCancelListener) {
      document.removeEventListener('click', _connectCancelListener);
      _connectCancelListener = null;
    }
    document.getElementById('bracketActions')?.remove();
    clearPropositionHighlights();
    return;
  }

  if (arcSelectStep === 0) {
    const bracketIdx = findBracketContainingProposition(index);
    if (bracketIdx !== null) {
      const arc = arcs[bracketIdx];
      highlightPropositionRange(arc.from, arc.to, true);
      const blocks = propositionsContainer.querySelectorAll('.proposition-block');
      const rFrom = blocks[arc.from]?.getBoundingClientRect?.();
      const rTo = blocks[arc.to]?.getBoundingClientRect?.();
      const wr = propositionsContainer.parentElement?.getBoundingClientRect();
      const centerY = rFrom && rTo && wr ? ((rFrom.top + rFrom.bottom + rTo.top + rTo.bottom) / 4 - wr.top) : 0;
      const centerX = propositionsContainer.parentElement ? propositionsContainer.parentElement.offsetWidth / 2 : 0;
      showBracketActions(bracketIdx, centerY, centerX);
      return;
    }
  }

  const sel = { type: 'single', from: index, to: index };

  if (arcSelectStep === 0) {
    arcFrom = sel;
    arcSelectStep = 1;
    highlightPropositionRange(sel.from, sel.to, true);
    showStatus('Now click the second proposition or bracket group.', 'success');
  } else if (arcSelectStep === 1) {
    const fromStart = arcFrom.from;
    const fromEnd = arcFrom.to;
    if (index >= fromStart && index <= fromEnd) {
      arcCanvas?.classList.remove('connect-mode');
      arcSelectStep = 0;
      arcFrom = null;
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

function handleBracketGroupClick(arcIdx) {
  const arc = arcs[arcIdx];
  const sel = { type: 'range', from: arc.from, to: arc.to, arcIdx };

  if (arcSelectStep === 0) {
    arcFrom = sel;
    arcSelectStep = 1;
    highlightPropositionRange(sel.from, sel.to, true);
    arcCanvas?.classList.add('connect-mode');
    showStatus('Click a proposition to connect to, or another bracket to create an arc.', 'success');
  } else if (arcSelectStep === 1) {
    const fromStart = arcFrom.from;
    const fromEnd = arcFrom.to;
    if (arc.from >= fromStart && arc.to <= fromEnd) {
      arcCanvas?.classList.remove('connect-mode');
      arcSelectStep = 0;
      arcFrom = null;
      clearPropositionHighlights();
      showStatus('Bracket cancelled. Select a different first item.', 'error');
      return;
    }
    const toStart = Math.min(fromStart, arc.from);
    const toEnd = Math.max(fromEnd, arc.to);
    showRelationshipPicker(toStart, toEnd);
  }
}

function showRelationshipPicker(from, to) {
  arcCanvas?.classList.remove('connect-mode');
  clearPropositionHighlights();
  arcSelectStep = 0;
  arcFrom = null;
  // Add unlabelled bracket (dashed + ?); user clicks the bracket to choose relationship
  undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });
  arcs = arcs.map(a => {
    const overlaps = a.from <= to && a.to >= from;
    const isEnclosingOrEnclosed = (a.from <= from && a.to >= to) || (from <= a.from && to >= a.to);
    if (overlaps && !isEnclosingOrEnclosed) {
      return { ...a, from: Math.min(a.from, from), to: Math.max(a.to, to) };
    }
    return a;
  });

  arcs.push({ from, to, type: 'unspecified', labelsSwapped: false });
  renderArcs();
  showStatus('Bracket added. Click the bracket to choose relationship.', 'success');
}

function highlightPropositionRange(from, to, on) {
  for (let i = from; i <= to; i++) {
    const block = propositionsContainer.querySelector(`[data-index="${i}"]`);
    if (block) block.classList.toggle('arc-selected', on);
  }
}

function clearPropositionHighlights() {
  document.querySelectorAll('.proposition-block.arc-selected').forEach((b) => b.classList.remove('arc-selected'));
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
  undoStack.push({ action: 'divide', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });
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
  arcs = arcs.map(({ from, to, type, labelsSwapped }) => ({
    from: from >= index + 1 ? from + 1 : from,
    to: to >= index ? to + 1 : to,
    type,
    labelsSwapped: labelsSwapped ?? false,
  }));
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
  arcs = prev.arcs;
  renderPropositions();
  showStatus(`Undid last ${prev.action}.`, 'success');
}


function updateArcPositions() {
  requestAnimationFrame(() => {
    renderArcs();
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
  temporal: 'T',
  locative: 'L',
  'action-manner': 'Ac*/Mn',
  comparison: '*/Cf',
  'negative-positive': '-/+*',
  'idea-explanation': 'Id/Exp*',
  'question-answer': 'Q/A*',
  concessive: 'Csv',
  'situation-response': 'Sit/R*',
  unspecified: '?',
};

// Bracket geometry constants (shared for getConnectionPoints and renderArcs)
const BRACKET_GEO = {
  PADDING_LEFT: 390, // Space for nested brackets (2x previous)
  GAP: 4,
  BRACKET_WIDTH: 10,
  SLOT_WIDTH: 28, // Horizontal gap between slots so labels don't overlap
};

let _slotForIdx = {};
let _maxSlot = 0;

function arcContainsForSlot(outer, outerIdx, inner, innerIdx) {
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
    arcs.forEach((a, i) => {
      if (arcContainsForSlot(arcs[idx], idx, a, i)) visit(i);
    });
    order.push(idx);
  };
  arcs.forEach((_, i) => visit(i));
  order.forEach((idx) => {
    const arc = arcs[idx];
    const contained = arcs
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => arcContainsForSlot(arc, idx, a, i));
    if (contained.length === 0) {
      _slotForIdx[idx] = 0;
    } else {
      _slotForIdx[idx] = 1 + Math.max(...contained.map(({ i }) => _slotForIdx[i]));
    }
  });
  _maxSlot = arcs.length ? Math.max(...Object.values(_slotForIdx)) : 0;
}

function getBracketX(arcIdx) {
  const slot = _slotForIdx[arcIdx] ?? 0;
  // Slot 0 = rightmost (closer to text); higher slots = further left (outer brackets)
  return BRACKET_GEO.PADDING_LEFT - BRACKET_GEO.GAP - BRACKET_GEO.BRACKET_WIDTH - slot * BRACKET_GEO.SLOT_WIDTH;
}

function getConnectionPoints(spanFrom, spanTo, positions, excludeArcIdx = -1) {
  const innerAtTop = arcs
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => i !== excludeArcIdx && a.from === spanFrom && a.to < spanTo)
    .sort((x, y) => y.a.to - x.a.to)[0];
  const innerAtBottom = arcs
    .map((a, i) => ({ a, i }))
    .filter(({ a, i }) => i !== excludeArcIdx && a.to === spanTo && a.from > spanFrom)
    .sort((x, y) => x.a.from - y.a.from)[0];

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
function renderArcs() {
  if (!propositionsContainer?.parentElement || !arcCanvas) return;
  const wrapper = propositionsContainer.parentElement;
  const rect = wrapper.getBoundingClientRect();

  arcCanvas.setAttribute('width', rect.width);
  arcCanvas.setAttribute('height', rect.height);
  arcCanvas.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

  arcCanvas.innerHTML = '';

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

  const BRACKET_STROKE = 1;
  const { PADDING_LEFT, GAP, BRACKET_WIDTH, SLOT_WIDTH } = BRACKET_GEO;

  computeSlotAssignments();
  const slotForIdx = _slotForIdx;
  const maxSlot = _maxSlot;

  const labelsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  labelsLayer.setAttribute('class', 'bracket-labels-layer');

  arcs.forEach((arc, idx) => {
    const { from, to, type, labelsSwapped } = arc;
    const a = positions[from];
    const b = positions[to];
    if (!a || !b) return;

    const slot = slotForIdx[idx] ?? 0;
    const BRACKET_X = PADDING_LEFT - GAP - BRACKET_WIDTH - slot * SLOT_WIDTH;

    // Bracket ends at * for inner brackets, or middle for single-label; otherwise at proposition centers
    const { topY, topLeft, bottomY, bottomLeft } = getConnectionPoints(from, to, positions, idx);

    const hasComment = !!getCommentForBracket(idx);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-arc-index', idx);
    g.classList.add('bracket-group');
    if (hasComment) g.classList.add('has-comment');
    const d = `M ${topLeft} ${topY} L ${BRACKET_X} ${topY} L ${BRACKET_X} ${bottomY} L ${bottomLeft} ${bottomY}`;
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', 16);
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
        for (let j = arc.from; j <= arc.to; j++) {
          const block = propositionsContainer.querySelector(`[data-index="${j}"]`);
          if (block) block.classList.add('arc-hover');
        }
      });
      el.addEventListener('mouseleave', () => {
        if (g) g.classList.remove('bracket-hover');
        document.querySelectorAll('.comments-preview-card.comment-hover-active').forEach(c => c.classList.remove('comment-hover-active'));
        document.querySelectorAll('.proposition-block.arc-hover').forEach((b) => b.classList.remove('arc-hover'));
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
          arcSelectStep = 0;
          arcFrom = null;
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
        undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });
        arcs.splice(idx, 1);
        renderArcs();
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
      topLabel.textContent = labels.top;
      const bottomLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      bottomLabel.setAttribute('x', BRACKET_X - 4);
      bottomLabel.setAttribute('y', bottomY);
      bottomLabel.setAttribute('text-anchor', 'end');
      bottomLabel.setAttribute('dominant-baseline', 'central');
      bottomLabel.setAttribute('font-size', '12');
      bottomLabel.setAttribute('class', `bracket-label ${type}`);
      bottomLabel.textContent = labels.bottom;
      attachBracketEvents(topLabel, false);
      attachBracketEvents(bottomLabel, false);
      labelsLayer.appendChild(topLabel);
      labelsLayer.appendChild(bottomLabel);
    }

    attachBracketEvents(g, false);
    arcCanvas.appendChild(g);
  });

  arcCanvas.appendChild(labelsLayer);

  // Connection nodes: one per proposition line + one per bracket (at * or center)
  const NODE_R = 6;
  const NODE_GAP = 2; // Gap between node and label/text
  const CHARS_TO_PX = 7; // Approx px per char at 12px font for label width

  const nodesG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodesG.setAttribute('class', 'connection-nodes');
  nodesG.style.pointerEvents = 'all';

  // Proposition nodes: only for propositions NOT covered by any bracket
  positions.forEach((pos, i) => {
    const inBracket = arcs.some((a) => a.from <= i && i <= a.to);
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
  arcs.forEach((outer, j) => {
    const innerAtTop = arcs
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => i !== j && a.from === outer.from && a.to < outer.to)
      .sort((x, y) => y.a.to - x.a.to)[0];
    const innerAtBottom = arcs
      .map((a, i) => ({ a, i }))
      .filter(({ a, i }) => i !== j && a.to === outer.to && a.from > outer.from)
      .sort((x, y) => x.a.from - y.a.from)[0];
    if (innerAtTop) innerBracketIndices.add(innerAtTop.i);
    if (innerAtBottom) innerBracketIndices.add(innerAtBottom.i);
  });

  arcs.forEach((arc, idx) => {
    const isInner = innerBracketIndices.has(idx);

    const { from, to, type, labelsSwapped } = arc;
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
    circle.setAttribute('data-arc-index', idx);
    circle.style.cursor = 'pointer';
    nodesG.appendChild(circle);

    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      handleBracketGroupClick(idx);
    });

    const bracketGroup = arcCanvas.querySelector(`.bracket-group[data-arc-index="${idx}"]`);
    circle.addEventListener('mouseenter', () => {
      if (bracketGroup) bracketGroup.classList.add('bracket-hover');
      for (let j = arc.from; j <= arc.to; j++) {
        const block = propositionsContainer.querySelector(`[data-index="${j}"]`);
        if (block) block.classList.add('arc-hover');
      }
    });
    circle.addEventListener('mouseleave', () => {
      if (bracketGroup) bracketGroup.classList.remove('bracket-hover');
      document.querySelectorAll('.proposition-block.arc-hover').forEach((b) => b.classList.remove('arc-hover'));
    });
  });

  arcCanvas.appendChild(nodesG);
}

function getCommentForBracket(arcIdx) {
  return comments.find((c) => c.type === 'bracket' && c.target && c.target.arcIdx === arcIdx) || null;
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
    if (c.type === 'bracket' && c.target && arcs[c.target.arcIdx]) {
      const arc = arcs[c.target.arcIdx];
      const label = BRACKET_LABELS[arc.type] || arc.type;
      const fromRef = verseRefs[arc.from] ?? String(arc.from + 1);
      const toRef = verseRefs[arc.to] ?? String(arc.to + 1);
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
        const arc = arcs[c.target.arcIdx];
        if (arc != null) {
          const block = propositionsContainer?.querySelector(`.proposition-block[data-index="${arc.from}"]`);
          if (block) block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          const wrapper = arcCanvas?.parentElement;
          if (wrapper) {
            const rect = wrapper.getBoundingClientRect();
            const blocks = propositionsContainer?.querySelectorAll('.proposition-block');
            const rFrom = blocks?.[arc.from]?.getBoundingClientRect?.();
            const rTo = blocks?.[arc.to]?.getBoundingClientRect?.();
            let centerY = rect.height / 2;
            let centerX = rect.width / 2;
            if (rFrom && rTo) {
              centerY = (rFrom.top + rFrom.bottom + rTo.top + rTo.bottom) / 4 - rect.top;
              centerX = (rFrom.left + rFrom.right + rTo.left + rTo.right) / 4 - rect.left;
            }
            showCommentPopoverForBracket(c.target.arcIdx, centerY, centerX);
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

function makeCommentPopoverDraggableAndResizable(popover) {
  const wrapper = popover.parentElement;
  if (!wrapper) return;
  const titleEl = popover.querySelector('.comment-popover-title');
  if (titleEl) {
    titleEl.style.cursor = 'grab';
    titleEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(popover.style.left) || 0;
      const startTop = parseFloat(popover.style.top) || 0;
      titleEl.style.cursor = 'grabbing';
      const onMove = (e2) => {
        const dx = e2.clientX - startX;
        const dy = e2.clientY - startY;
        const rect = wrapper.getBoundingClientRect();
        let left = startLeft + dx;
        let top = startTop + dy;
        const popRect = popover.getBoundingClientRect();
        left = Math.max(0, Math.min(left, rect.width - popRect.width));
        top = Math.max(0, Math.min(top, rect.height - popRect.height));
        popover.style.left = left + 'px';
        popover.style.top = top + 'px';
      };
      const onUp = () => {
        titleEl.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        popover._dragJustEnded = true;
        setTimeout(() => { popover._dragJustEnded = false; }, 0);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
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

  const wrapper = arcCanvas?.parentElement || document.body;
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

function showCommentPopoverForBracket(arcIdx, centerY, centerX, options = {}) {
  const existing = document.getElementById('commentPopover');
  if (existing) existing.remove();

  const existingComment = getCommentForBracket(arcIdx);
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

  const wrapper = arcCanvas?.parentElement || document.body;
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
      showCommentPopoverForBracket(arcIdx, centerY, centerX, { viewMode: false, lastWidth, lastHeight, lastLeft, lastTop });
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
        target: { arcIdx },
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
    renderArcs();
    showStatus(existingComment ? (text ? 'Comment updated.' : 'Comment removed.') : 'Comment added.', 'success');
    if (reopenViewMode) showCommentPopoverForBracket(arcIdx, centerY, centerX, { viewMode: true, lastWidth, lastHeight, lastLeft, lastTop });
  });

  if (existingComment) {
    popover.querySelector('[data-action="delete"]').addEventListener('click', () => {
      comments = comments.filter((c) => c.id !== existingComment.id);
      popover.remove();
      document.removeEventListener('click', dismiss);
      renderCommentPreviews();
      renderArcs();
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

function showBracketActions(arcIdx, centerY, centerX) {
  connectBracketToArcIdx = null;
  const existing = document.getElementById('bracketActions');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'bracketActions';
  popover.className = 'bracket-actions';
  const arc = arcs[arcIdx];
  const hasTwoLabels = !SINGLE_LABEL_TYPES.has(arc.type);
  const hasComment = !!getCommentForBracket(arcIdx);
  popover.innerHTML = `
    <button data-action="delete">Delete</button>
    <button data-action="label">Change label</button>
    ${hasTwoLabels ? '<button data-action="swap">Swap labels</button>' : ''}
    <button data-action="select" title="Select bracket, then click a proposition to connect to (reparents) or another bracket to create arc">Select to connect</button>
    <button data-action="comment" title="Add or view a comment on this bracket">${hasComment ? 'View comment' : 'Add comment'}</button>
  `;

  const wrapper = arcCanvas.parentElement;
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
    undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });
    arcs.splice(arcIdx, 1);
    comments = comments.filter((c) => c.type !== 'bracket' || c.target?.arcIdx !== arcIdx);
    comments.forEach((c) => { if (c.type === 'bracket' && c.target?.arcIdx > arcIdx) c.target.arcIdx--; });
    renderArcs();
    renderCommentPreviews();
    clearAndDismiss();
    showStatus('Bracket removed.', 'success');
  });

  popover.querySelector('[data-action="label"]').addEventListener('click', (e) => {
    e.stopPropagation();
    clearAndDismiss();
    showLabelPicker(arcIdx, centerY, centerX);
  });

  const swapBtn = popover.querySelector('[data-action="swap"]');
  if (swapBtn) {
    swapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });
      arcs[arcIdx].labelsSwapped = !arcs[arcIdx].labelsSwapped;
      renderArcs();
      clearAndDismiss();
      showStatus('Labels swapped.', 'success');
    });
  }

  popover.querySelector('[data-action="select"]').addEventListener('click', (e) => {
    e.stopPropagation();
    popover.remove();
    document.removeEventListener('click', dismiss);
    handleBracketGroupClick(arcIdx);
  });

  popover.querySelector('[data-action="comment"]').addEventListener('click', (e) => {
    e.stopPropagation();
    clearAndDismiss();
    showCommentPopoverForBracket(arcIdx, centerY, centerX);
  });

  const dismiss = (e) => {
    if (popover.parentNode && popover.contains(e.target)) return;
    connectBracketToArcIdx = null;
    clearAndDismiss();
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

function showLabelPicker(arcIdx, centerY, centerX) {
  const existing = document.getElementById('labelPicker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.id = 'labelPicker';
  picker.className = 'label-picker relationship-picker';

  const wrapper = arcCanvas.parentElement;
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
      arcs[arcIdx].type = typeKey;
      renderArcs();
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
    arcs.splice(arcIdx, 1);
    comments = comments.filter((c) => c.type !== 'bracket' || c.target?.arcIdx !== arcIdx);
    comments.forEach((c) => {
      if (c.type === 'bracket' && c.target?.arcIdx > arcIdx) c.target.arcIdx--;
    });
    renderArcs();
    renderCommentPreviews();
    picker.remove();
    document.removeEventListener('click', dismiss);
    showStatus('Bracket removed.', 'success');
  });
  picker.appendChild(deleteBtn);

  picker.style.left = `${Math.max(8, Math.min(centerX - 210, wrapper.offsetWidth - 430))}px`;
  picker.style.top = `${Math.max(8, centerY - 130)}px`;
  wrapper.appendChild(picker);
  const maxTop = wrapper.offsetHeight - picker.offsetHeight - 8;
  if (parseFloat(picker.style.top) > maxTop) picker.style.top = `${maxTop}px`;

  const dismiss = (e) => {
    if (picker.parentNode && picker.contains(e.target)) return;
    picker.remove();
    document.removeEventListener('click', dismiss);
  };
  setTimeout(() => document.addEventListener('click', dismiss), 0);
}

// New arc: prompt to save current, then start fresh
function startNewArc() {
  passageRef = '—';
  propositions = [];
  verseRefs = [];
  arcs = [];
  undoStack = [];
  comments = [];
  arcSelectStep = 0;
  arcFrom = null;
  connectBracketToArcIdx = null;
  clearPropositionHighlights();
  if (passageHeader) passageHeader.textContent = passageRef;
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel) copyrightLabel.textContent = '(ESV)';
  if (propositionsContainer) propositionsContainer.classList.remove('greek-text');
  renderPropositions();
  renderArcs();
  document.getElementById('bracketActions')?.remove();
  document.getElementById('labelPicker')?.remove();
  document.getElementById('commentPopover')?.remove();
  renderCommentPreviews();
  showStatus('New arc started. Fetch or import a passage to begin.', 'success');
}

async function handleNewArc() {
  const hasContent = propositions.length > 0 && propositions.some((p) => p && p.trim() && p !== '(empty)');
  if (!hasContent) {
    startNewArc();
    return;
  }
  const wrapper = arcCanvas?.parentElement || document.body;
  const dialog = document.createElement('div');
  dialog.className = 'label-picker new-arc-dialog';
  dialog.innerHTML = `
    <p class="picker-title">Save current arc before starting new?</p>
    <div class="new-arc-buttons">
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
        await saveArc();
        startNewArc();
      } catch (_) {
        showStatus('Save cancelled.', 'error');
      }
      resolve();
    });
    dialog.querySelector('[data-action="discard"]').addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
      startNewArc();
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

const newArcBtn = document.getElementById('newArcBtn');
if (newArcBtn) newArcBtn.addEventListener('click', () => handleNewArc());

// Clear brackets
if (clearArcsBtn) clearArcsBtn.addEventListener('click', () => {
  if (arcs.length === 0) return;
  undoStack.push({ action: 'bracket', propositions: propositions.slice(), verseRefs: verseRefs.slice(), arcs: arcs.map((a) => ({ ...a })) });
  arcs = [];
  renderArcs();
  arcSelectStep = 0;
  arcFrom = null;
  clearPropositionHighlights();
  showStatus('All brackets cleared.', 'success');
});

// Import pasted text
const pasteText = document.getElementById('pasteText');
const importBtn = document.getElementById('importBtn');

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

  // Try to parse as exported JSON arc text
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && Array.isArray(data.propositions)) {
      importArc(data);
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
  arcs = [];
  renderArcs();
  showStatus('Imported. Double-click in text to split / single click to edit. Use nodes or verse refs for brackets.', 'success');
});

// Export / Import arc as JSON file + Recent list
const exportBtn = document.getElementById('exportBtn');
const openFileBtn = document.getElementById('openFileBtn');
const importFileBtn = document.getElementById('importFileBtn');
const importFileInput = document.getElementById('importFileInput');
const recentListEl = document.getElementById('recentList');

const RECENT_KEY = 'biblearc_recent';
const RECENT_MAX = 10;

function getRecentArcs() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentArcs(items) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, RECENT_MAX)));
  } catch (e) {
    console.warn('Could not save recent arcs:', e);
  }
}

function addToRecent(data) {
  const items = getRecentArcs();
  const label = data.passageRef || 'Imported arc';
  const existing = items.findIndex((i) => (i.passageRef || i.data?.passageRef) === label);
  const entry = { passageRef: label, data, accessedAt: Date.now() };
  const next = existing >= 0
    ? [entry, ...items.slice(0, existing), ...items.slice(existing + 1)]
    : [entry, ...items];
  saveRecentArcs(next);
  renderRecentList();
}

function renderRecentList() {
  if (!recentListEl) return;
  const items = getRecentArcs();
  recentListEl.innerHTML = '';
  items.forEach((item, idx) => {
    const li = document.createElement('li');
    const label = item.passageRef || item.data?.passageRef || 'Arc';
    li.innerHTML = `<button type="button" class="recent-item" data-idx="${idx}" title="Load this arc">${escapeHtml(label)}</button>`;
    li.querySelector('button').addEventListener('click', () => {
      const arc = getRecentArcs()[idx];
      if (arc?.data) importArc(arc.data);
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
  const match = ref.match(/^([\d\s]*[a-zA-Z]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?/);
  let defaultPassagePrefix = ref.replace(/\s+|:/g, '-');
  
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

function buildArcData() {
  return {
    version: 1,
    passageRef,
    propositions,
    verseRefs,
    arcs: arcs.map((a) => ({ ...a })),
    comments: comments.map((c) => ({ ...c })),
    copyrightLabel: document.getElementById('copyrightLabel')?.textContent || '',
    pageAuthor: (document.getElementById('pageAuthor')?.value || '').trim(),
    exportedAt: new Date().toISOString(),
  };
}

let saveFileHandle = null;

async function saveArc() {
  if (propositions.length === 0) {
    showStatus('Nothing to save. Fetch or import a passage first.', 'error');
    return;
  }
  const data = buildArcData();
  const json = JSON.stringify(data, null, 2);

  try {
    if (saveFileHandle && 'createWritable' in saveFileHandle) {
      const writable = await saveFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      addToRecent(data);
      showStatus('Saved.', 'success');
    } else if ('showSaveFilePicker' in window) {
      const name = `${getExportFilename()}.json`;
      saveFileHandle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await saveFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      addToRecent(data);
      showStatus('Saved.', 'success');
    } else {
      exportArc();
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    showStatus(err.message || 'Save failed.', 'error');
  }
}

function exportArc() {
  if (propositions.length === 0) {
    showStatus('Nothing to export. Fetch or import a passage first.', 'error');
    return;
  }
  const data = buildArcData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const name = `${getExportFilename()}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  addToRecent(data);
  showStatus('Arc exported.', 'success');
}

function importArc(data) {
  if (!data || !Array.isArray(data.propositions)) {
    showStatus('Invalid arc file.', 'error');
    return;
  }
  passageRef = data.passageRef || 'Imported arc';
  propositions = data.propositions.slice();
  verseRefs = Array.isArray(data.verseRefs) && data.verseRefs.length === propositions.length
    ? data.verseRefs.slice()
    : propositions.map((_, i) => String(i + 1));
  arcs = Array.isArray(data.arcs) ? data.arcs.map((a) => ({ ...a })) : [];
  comments = Array.isArray(data.comments) ? data.comments.map((c) => ({ ...c, replies: Array.isArray(c.replies) ? c.replies.map((r) => ({ ...r })) : [] })) : [];

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
  arcSelectStep = 0;
  arcFrom = null;
  clearPropositionHighlights();
  renderPropositions();
  renderArcs();
  renderCommentPreviews();
  addToRecent(data);
  showStatus('Arc loaded.', 'success');
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
    const canvas = await html2canvas(workspace, {
      useCORS: true,
      scale: 2,
      backgroundColor: null,
      logging: false,
    });
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

const copyForWordBtn = document.getElementById('copyForWordBtn');
if (copyForWordBtn) copyForWordBtn.addEventListener('click', copyDiagramForWord);

const copyDataBtn = document.getElementById('copyDataBtn');
if (copyDataBtn) {
  copyDataBtn.addEventListener('click', async () => {
    if (propositions.length === 0) {
      showStatus('Nothing to copy. Fetch or import a passage first.', 'error');
      return;
    }
    const data = buildArcData();
    try {
      await navigator.clipboard.writeText(JSON.stringify(data));
      showStatus('Arc data copied to clipboard. Paste into the "Paste passage text" box to import elsewhere.', 'success');
    } catch (err) {
      showStatus('Could not access clipboard. Please use Export instead.', 'error');
    }
  });
}

const saveBtn = document.getElementById('saveBtn');
if (saveBtn) saveBtn.addEventListener('click', () => saveArc());
if (exportBtn) exportBtn.addEventListener('click', exportArc);

async function openArcFile() {
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
      importArc(data);
    } catch (err) {
      if (err.name !== 'AbortError') showStatus(err.message || 'Could not open file.', 'error');
    }
  } else {
    importFileInput?.click();
  }
}

if (openFileBtn) openFileBtn.addEventListener('click', openArcFile);

if (importFileBtn && importFileInput) {
  importFileBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importArc(data);
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
if (textEditModeBtn) {
  textEditModeBtn.addEventListener('click', () => {
    textEditMode = !textEditMode;
    textEditModeBtn.classList.toggle('active', textEditMode);
    textEditModeBtn.title = textEditMode ? 'Text edit mode on: edit text directly, use Tab for indent, Enter for newlines.' : 'Toggle text edit mode: edit text freely with newlines and indentation. No brackets or dividing.';
    if (textEditMode) {
      if (commentMode) document.getElementById('commentModeBtn')?.click();
      arcCanvas?.classList.remove('connect-mode');
      arcSelectStep = 0;
      arcFrom = null;
      if (typeof clearPropositionHighlights === 'function') clearPropositionHighlights();
      showStatus('Text Edit mode on. Brackets disabled; Enter adds linebreaks, Tab indents.', 'success');
    } else {
      showStatus('Text Edit mode off.', 'success');
    }
  });
}

const commentModeBtn = document.getElementById('commentModeBtn');
if (commentModeBtn) {
  commentModeBtn.addEventListener('click', () => {
    commentMode = !commentMode;
    commentModeBtn.classList.toggle('active', commentMode);
    commentModeBtn.title = commentMode ? 'Comment mode on: highlight text to add a comment, or click a bracket and choose Add comment' : 'Toggle comment mode';
    if (commentMode) {
      if (textEditMode) document.getElementById('textEditModeBtn')?.click();
      arcCanvas?.classList.remove('connect-mode');
      arcSelectStep = 0;
      arcFrom = null;
      if (typeof clearPropositionHighlights === 'function') clearPropositionHighlights();
      showStatus(commentMode ? 'Comment mode on. Highlight text or click a bracket to add a comment.' : 'Comment mode off.', 'success');
    } else {
      showStatus('Comment mode off.', 'success');
    }
  });
}

// Text selection in comment mode: add comment on selected text
if (propositionsContainer) {
  propositionsContainer.addEventListener('mouseup', () => {
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

// Resize observer for arc redraw
if (propositionsContainer?.parentElement) {
  const resizeObserver = new ResizeObserver(() => updateArcPositions());
  resizeObserver.observe(propositionsContainer.parentElement);
}

// Initial placeholder (when no passage yet)
const propEditor = document.getElementById('propositionEditor');
if (propEditor) propEditor.placeholder = 'Fetch or import a passage, then use Divide mode to click and split the text.';

// Sidebar Toggles
const toggleLeftSidebarBtn = document.getElementById('toggleLeftSidebarBtn');
const toggleRightSidebarBtn = document.getElementById('toggleRightSidebarBtn');
const leftSidebar = document.querySelector('.arc-types');
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
