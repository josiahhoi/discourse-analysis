/**
 * Discourse Analysis Persistence Service
 * Handles Drafts, Auto-save, and Recent projects
 */

const DRAFT_KEY = 'biblebracket_draft';
const RECENT_KEY = 'biblebracket_recent';
const RECENT_MAX = 10;

function saveDraft() {
  try {
    if (DA_STATE.propositions.length > 0 && DA_STATE.propositions.some((p) => p && p.trim() && p !== '(empty)')) {
      const data = DA_EXPORT.buildBracketData();
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    }
  } catch (_) {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
}

function normalizeBracketData(data) {
  if (!data || !Array.isArray(data.propositions)) return data;
  
  const rawBrackets = Array.isArray(data.brackets) ? data.brackets : (Array.isArray(data.arcs) ? data.arcs : []);
  if (rawBrackets.length === 0) return data;

  // Only migrate if we find numeric 'from' or 'to' properties (legacy format)
  const needsMigration = rawBrackets.some(b => typeof b.from === 'number' || typeof b.to === 'number');
  if (!needsMigration) return data;

  // 1. Prepare indexed brackets to track original order for comment mapping
  const indexedBrackets = rawBrackets.map((b, i) => ({ ...b, _originalIdx: i }));
  
  // 2. Sort by span width (inner-most first) to reconstruct the logical hierarchy
  // Narrower brackets must be processed first so they can be "owned" by wider ones.
  indexedBrackets.sort((a, b) => {
    const widthA = (a.to || 0) - (a.from || 0);
    const widthB = (b.to || 0) - (b.from || 0);
    return widthA - widthB || a._originalIdx - b._originalIdx;
  });

  // 3. Track what currently "owns" each proposition index
  let owners = data.propositions.map((_, i) => `p${i}`);
  const newBrackets = [];
  const oldToNewIdx = {};

  indexedBrackets.forEach((oldB, newIdx) => {
    const fromIdx = oldB.from || 0;
    const toIdx = oldB.to || 0;
    
    // The logical targets are whatever currently owns these indices at this point in the assembly
    const newFrom = owners[fromIdx];
    const newTo = owners[toIdx];
    
    const id = oldB.id || String(Date.now() + newIdx);
    const { _originalIdx, ...cleanB } = oldB;
    
    newBrackets.push({
      ...cleanB,
      id,
      from: newFrom,
      to: newTo,
      dominanceFlipped: !!oldB.dominanceFlipped,
      labelsSwapped: !!oldB.labelsSwapped
    });
    
    oldToNewIdx[_originalIdx] = newIdx;
    
    // Update the ownership map: this range is now covered by the new bracket
    const bracketRef = `b${newIdx}`;
    for (let k = fromIdx; k <= toIdx; k++) {
      owners[k] = bracketRef;
    }
  });

  // 4. Update comment targets to match the new bracket indices
  const newComments = (Array.isArray(data.comments) ? data.comments : []).map(c => {
    if (!c.target) return c;
    let target = { ...c.target };
    const oldIdx = target.bracketIdx !== undefined ? target.bracketIdx : target.arcIdx;
    if (oldIdx !== undefined && oldToNewIdx[oldIdx] !== undefined) {
      target.bracketIdx = oldToNewIdx[oldIdx];
      delete target.arcIdx;
    }
    return { ...c, target };
  });

  return { 
    ...data, 
    brackets: newBrackets, 
    comments: newComments,
    version: 1 // Normalize to current version
  };
}

function getDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function importBracket(data) {
  if (!data || !Array.isArray(data.propositions)) {
    DA_UI.showStatus('Invalid bracket file.', 'error');
    return;
  }
  
  // Legacy migration
  data = normalizeBracketData(data);
  
  DA_STATE.updateState({
    passageRef: data.passageRef || 'Imported bracket',
    propositions: data.propositions.slice(),
    verseRefs: Array.isArray(data.verseRefs) && data.verseRefs.length === data.propositions.length
      ? data.verseRefs.slice()
      : data.propositions.map((_, i) => String(i + 1)),
    brackets: (Array.isArray(data.brackets) ? data.brackets : (Array.isArray(data.arcs) ? data.arcs : [])).map((a) => ({ ...a })),
    formatTags: Array.isArray(data.formatTags) ? data.formatTags.map((t) => ({ ...t })) : [],
    wordArrows: Array.isArray(data.wordArrows) ? data.wordArrows.map((w) => ({ ...w })) : [],
    comments: Array.isArray(data.comments) ? data.comments.map((c) => {
        let target = { ...(c.target || {}) };
        if (target.arcIdx !== undefined) {
          target.bracketIdx = target.arcIdx;
          delete target.arcIdx;
        }
        return { ...c, target, replies: Array.isArray(c.replies) ? c.replies.map((r) => ({ ...r })) : [] };
    }) : [],
    undoStack: [],
    bracketSelectStep: 0,
    firstBracketPoint: null,
    activeProjectId: data.activeProjectId || null
  });

  const passageRefEl = document.getElementById('passageRef');
  if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;

  if (data.customLabels) {
    DA_STATE.customLabels = data.customLabels;
    // We intentionally do NOT update localStorage.setItem('da_custom_labels', ...) here
    // so that imported labels don't automatically enter the user's permanent bank.
  }
  
  const pageAuthorInputEl = document.getElementById('pageAuthor');
  if (pageAuthorInputEl && data.pageAuthor != null) {
    pageAuthorInputEl.value = data.pageAuthor;
    try { localStorage.setItem(DA_CONSTANTS.PAGE_AUTHOR_KEY, String(data.pageAuthor).trim()); } catch (_) { }
  }
  
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel && data.copyrightLabel) copyrightLabel.textContent = data.copyrightLabel;
  
  const propositionsContainer = document.getElementById('propositionsContainer');
  if (propositionsContainer) {
    propositionsContainer.classList.toggle('greek-text', !!data.copyrightLabel?.includes('SBL'));
  }

  DA_UI.clearPropositionHighlights();
  if (window.renderAll) window.renderAll();
  
  addToRecent(data);
  clearDraft();
  DA_UI.showStatus('Project loaded.', 'success');
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

function renderRecentList() {
  const recentListEl = document.getElementById('recentList');
  if (!recentListEl) return;
  const items = getRecentBrackets();
  recentListEl.innerHTML = '';
  items.forEach((item, idx) => {
    const li = document.createElement('li');
    const label = item.passageRef || item.data?.passageRef || 'Bracket';
    li.innerHTML = `<button type="button" class="recent-item" data-idx="${idx}" title="Load this bracket">${DA_UI.escapeHtml(label)}</button>`;
    li.querySelector('button').addEventListener('click', () => {
      const bracket = getRecentBrackets()[idx];
      if (bracket?.data) importBracket(bracket.data);
    });
    recentListEl.appendChild(li);
  });
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

  const ref = DA_STATE.passageRef || 'passage';
  const normalizedRef = ref.replace(/[\u2013\u2014]/g, '-');
  const match = normalizedRef.match(/^([\d\s]*[a-zA-Z][a-zA-Z\s.]*[a-zA-Z])\s+(\d+)(?::(\d+)(?:-(\d+))?)?/);
  let defaultPassagePrefix = ref.replace(/[\s:]+/g, '-');

  if (match) {
    const book = getBookAbbreviation(match[1]);
    const ch = match[2];
    const start = match[3];
    const end = match[4];
    defaultPassagePrefix = book + ch + (start ? '-' + start + (end ? '-' + end : '') : '');
  }

  const authorInput = document.getElementById('pageAuthor');
  const author = (authorInput?.value || '').trim().replace(/[\s/\\?%*:|"<>.]+/g, '-');
  return author ? `${defaultPassagePrefix}_${author}` : defaultPassagePrefix;
}

function updateFilenamePlaceholder() {
  const input = document.getElementById('exportFilename');
  if (input) input.placeholder = getExportFilename(true);
}

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

function initMagicPaste() {
    let _lastClipboardCheck = 0;
    let _lastClipboardText = '';

    window.addEventListener('paste', async (e) => {
        const html = e.clipboardData.getData('text/html');
        if (html && html.includes('DISCOURSE_DNA:')) {
            const match = html.match(/DISCOURSE_DNA:([^"\s>]+)/);
            if (match) {
                const compressed = match[1];
                try {
                    const json = LZString.decompressFromEncodedURIComponent(compressed);
                    const data = JSON.parse(json);
                    if (data && Array.isArray(data.propositions)) {
                        DA_UI.showMagicPasteBanner(data, '📋 Diagram detected in paste! ');
                        return;
                    }
                } catch (err) { console.error('Failed to parse DNA from HTML paste', err); }
            }
        }

        const text = e.clipboardData.getData('text/plain');
        if (text && text.startsWith('{') && text.includes('"propositions"')) {
            try {
                const data = JSON.parse(text);
                if (data && Array.isArray(data.propositions)) {
                    DA_UI.showMagicPasteBanner(data, '📋 Bracket data detected! ');
                }
            } catch (_) {}
        }
    });

    window.addEventListener('focus', async () => {
        const now = Date.now();
        if (now - _lastClipboardCheck < 5000) return;
        _lastClipboardCheck = now;

        try {
            const text = await navigator.clipboard.readText();
            if (!text || text === _lastClipboardText) return;
            _lastClipboardText = text;

            const trimmed = text.trim();
            if (!trimmed.startsWith('{') || !trimmed.includes('"propositions"')) return;

            let data;
            try { data = JSON.parse(trimmed); } catch (_) { return; }
            if (!data || !Array.isArray(data.propositions)) return;

            DA_UI.showMagicPasteBanner(data, '📋 Bracket data detected on clipboard: ');
        } catch (_) {}
    });
}

function initDraftRecovery() {
    const draft = getDraft();
    if (!draft || !Array.isArray(draft.propositions) || draft.propositions.length === 0) return;
    if (DA_STATE.propositions.length > 0 && DA_STATE.propositions.some((p) => p && p.trim() && p !== '(empty)')) return;

    const wrapper = document.querySelector('.bracket-canvas-wrapper') || document.body;
    const banner = document.createElement('div');
    banner.className = 'draft-recovery-banner';
    const label = draft.passageRef || 'an unnamed passage';
    banner.innerHTML = `
      <span class="draft-recovery-text">📝 Unsaved work on <strong>${DA_UI.escapeHtml(label)}</strong> was found. Restore it?</span>
      <div class="draft-recovery-actions">
        <button type="button" data-action="restore">Restore</button>
        <button type="button" data-action="dismiss" class="secondary">Dismiss</button>
      </div>
    `;
    wrapper.prepend(banner);

    banner.querySelector('[data-action="restore"]').addEventListener('click', () => {
      banner.remove();
      importBracket(draft);
      DA_UI.showStatus('Draft restored.', 'success');
    });
    banner.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
      banner.remove();
      clearDraft();
    });
}

// Auto-save every 30 seconds
setInterval(saveDraft, 30000);
window.addEventListener('beforeunload', saveDraft);

async function injectPngMetadata(blob, jsonString) {
  const buf = await blob.arrayBuffer();
  const src = new Uint8Array(buf);

  // Build tEXt chunk: keyword NUL text (all Latin-1)
  const keyword = 'BibleBracket';
  const safeJson = encodeURIComponent(jsonString);
  const chunkData = new Uint8Array(keyword.length + 1 + safeJson.length);
  for (let i = 0; i < keyword.length; i++) chunkData[i] = keyword.charCodeAt(i);
  chunkData[keyword.length] = 0; // NUL separator
  for (let i = 0; i < safeJson.length; i++) chunkData[keyword.length + 1 + i] = safeJson.charCodeAt(i);

  const type = [116, 69, 88, 116]; // 'tEXt'
  const crcInput = new Uint8Array(4 + chunkData.length);
  crcInput.set(type, 0);
  crcInput.set(chunkData, 4);
  const crc = crc32(crcInput);

  const chunk = new Uint8Array(12 + chunkData.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, chunkData.length);
  chunk.set(type, 4);
  chunk.set(chunkData, 8);
  dv.setUint32(8 + chunkData.length, crc);

  const insertAt = 33;
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(src.subarray(insertAt), insertAt + chunk.length);

  return new Blob([out], { type: 'image/png' });
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function extractPngMetadata(file) {
  try {
    const buf = await file.arrayBuffer();
    const data = new Uint8Array(buf);
    const dv = new DataView(buf);
    let offset = 8;
    while (offset < data.length - 12) {
      const length = dv.getUint32(offset);
      const type = String.fromCharCode(data[offset+4], data[offset+5], data[offset+6], data[offset+7]);
      if (type === 'tEXt') {
        const chunkData = data.subarray(offset + 8, offset + 8 + length);
        let sep = chunkData.indexOf(0);
        if (sep === -1) { offset += 12 + length; continue; }
        const key = String.fromCharCode(...chunkData.subarray(0, sep));
        if (key === 'BibleBracket') {
          const val = String.fromCharCode(...chunkData.subarray(sep + 1));
          return JSON.parse(decodeURIComponent(val));
        }
      }
      if (type === 'IEND') break;
      offset += 12 + length;
    }
  } catch (_) {}
  return null;
}

async function extractPdfMetadata(file) {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const text = new TextDecoder('latin1').decode(bytes);
    const dnaMarker = 'BibleBracketDNA:';
    const endMarker = '|||END';
    let searchFrom = 0;
    while (true) {
      const startIdx = text.indexOf(dnaMarker, searchFrom);
      if (startIdx === -1) break;
      const payloadStart = startIdx + dnaMarker.length;
      const endIdx = text.indexOf(endMarker, payloadStart);
      if (endIdx === -1) { searchFrom = payloadStart; continue; }
      const payload = text.substring(payloadStart, endIdx);
      if (!payload) { searchFrom = endIdx + endMarker.length; continue; }
      try {
        if (typeof LZString !== 'undefined') {
          const json = LZString.decompressFromEncodedURIComponent(payload);
          if (json) {
            const data = JSON.parse(json);
            if (data && Array.isArray(data.propositions)) return data;
          }
        }
        const data = JSON.parse(decodeURIComponent(payload));
        if (data && Array.isArray(data.propositions)) return data;
      } catch (_) {}
      searchFrom = endIdx + endMarker.length;
    }
  } catch (_) {}
  return null;
}

function processDNA(encoded) {
  try {
    let cleaned = decodeURIComponent(encoded).trim();
    cleaned = cleaned.replace(/[\u2013\u2014]/g, "-");
    if (typeof LZString === 'undefined') {
      DA_UI.showStatus('Decompression failed: LZString not loaded.', 'error');
      return;
    }
    const json = LZString.decompressFromEncodedURIComponent(cleaned);
    if (!json) {
      DA_UI.showStatus('Found data, but decompression failed.', 'error');
      return;
    }
    const data = JSON.parse(json);
    if (data && Array.isArray(data.propositions)) {
      importBracket(data);
    } else {
      DA_UI.showStatus('Data found, but it is not a valid bracket.', 'error');
    }
  } catch (err) {
    DA_UI.showStatus('Failed to read data: ' + err.message, 'error');
  }
}

async function saveBracket() {
  if (DA_STATE.propositions.length === 0) {
    DA_UI.showStatus('Nothing to save.', 'error');
    return;
  }
  const data = DA_EXPORT.buildBracketData();
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
      addToRecent(data);
      DA_UI.showStatus('Saved.', 'success');
    } else {
      exportBracket();
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    exportBracket();
  }
}

function exportBracket() {
  if (DA_STATE.propositions.length === 0) {
    DA_UI.showStatus('Nothing to export.', 'error');
    return;
  }
  const data = DA_EXPORT.buildBracketData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const name = `${getExportFilename()}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  addToRecent(data);
  DA_UI.showStatus('Bracket exported.', 'success');
}

function initDragAndDrop() {
    const dropZone = document.querySelector('.bracket-canvas-wrapper') || document.body;
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
        if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        let encoded = null;
        for (const type of e.dataTransfer.types) {
            const content = e.dataTransfer.getData(type);
            if (content && content.includes('DISCOURSE_DNA:')) {
                const match = content.match(/DISCOURSE_DNA:([^"\s>]+)/);
                if (match) { encoded = match[1]; break; }
            }
        }
        if (encoded) { processDNA(encoded); return; }

        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        if (file.type === 'application/json' || file.name.endsWith('.json')) {
            try {
                const text = await file.text();
                importBracket(JSON.parse(text));
            } catch (_) { DA_UI.showStatus('Could not read JSON file.', 'error'); }
        } else if (file.type === 'image/png' || file.name.endsWith('.png')) {
            const data = await extractPngMetadata(file);
            if (data) importBracket(data);
            else DA_UI.showStatus('No embedded data found in PNG.', 'error');
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const data = await extractPdfMetadata(file);
            if (data) importBracket(data);
            else DA_UI.showStatus('No embedded data found in PDF.', 'error');
        }
    });
}

// Auto-save interval and beforeunload are registered once above (line ~281)

window.DA_PERSISTENCE = {
    normalizeBracketData, saveDraft, clearDraft, getDraft, importBracket, initMagicPaste, initDraftRecovery,
    addToRecent, renderRecentList, getExportFilename, attachFilenameObservers,
    injectPngMetadata, extractPngMetadata, extractPdfMetadata, processDNA, saveBracket, exportBracket, initDragAndDrop
};
