
// DOM Elements
const propositionsContainer = document.getElementById('propositions');
const bracketCanvas = document.getElementById('bracketCanvas');
const wordArrowsSvg = document.getElementById('wordArrowsSvg');
const passageInput = document.getElementById('passageInput');
const fetchBtn = document.getElementById('fetchBtn');
if (fetchBtn) {
  fetchBtn.addEventListener('click', requestFetchPassage);
}
initDelegatedListeners();
const passageRefEl = document.getElementById('passageRef');
// The header ref is contenteditable ("Click to edit passage reference"), so sync
// edits back into state — otherwise saves/exports/filenames keep the old ref.
if (passageRefEl) {
  passageRefEl.addEventListener('input', () => {
    DA_STATE.passageRef = passageRefEl.textContent.trim();
  });
  passageRefEl.addEventListener('keydown', (e) => {
    // A single-line field: Enter commits (blur) instead of inserting a newline.
    if (e.key === 'Enter') { e.preventDefault(); passageRefEl.blur(); }
  });
}
const themeToggle = document.getElementById('themeToggle');
const toggleCommentsBtn = document.getElementById('toggleCommentsBtn');

const newBracketBtn = document.getElementById('newBracketBtn');
const clearBracketsBtn = document.getElementById('clearBrackets');
const saveBtn = document.getElementById('saveBtn');
const saveAsBtn = document.getElementById('saveAsBtn');
const exportMenuBtn = document.getElementById('exportMenuBtn');
const importBtn = document.getElementById('importBtn');
const importFileInput = document.getElementById('importFileInput');
const projectSettingsBtn = document.getElementById('projectSettingsBtn');
const undoDivideBtn = document.getElementById('undoDivideBtn');
const redoBtn = document.getElementById('redoBtn');
const textEditModeBtn = document.getElementById('textEditModeBtn');
const arrowModeBtn = document.getElementById('arrowModeBtn');
const alternateViewsBtn = document.getElementById('alternateViewsBtn');
const openMenuBtn = document.getElementById('openMenuBtn');
const reviewerNameInput = document.getElementById('reviewerName');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const openReferenceGuideBtn = document.getElementById('openReferenceGuideBtn');
const closeReferenceBtn = document.getElementById('closeReferenceBtn');

// Global Aliases for backward compatibility in legacy handlers
window.renderAll = () => DA_RENDERER.renderAll();
window.scheduleVisualUpdate = () => DA_RENDERER.scheduleVisualUpdate();
window.updateBracketPositions = () => DA_RENDERER.updateBracketPositions();
window.saveBracket = () => DA_PERSISTENCE.saveBracket();

function clearAllFormatting() {
  DA_STATE.updateState({
    brackets: [],
    wordArrows: [],
    comments: [],
    formatTags: [],
    indentation: [],
    bracketHighlights: {},
    bracketSelectStep: 0,
    firstBracketPoint: null
  });
  document.getElementById('bracketCanvas')?.classList.remove('connect-mode');
}

// Service Initializations
DA_UI.initTheme();
DA_UI.initZoom();

if (themeToggle) themeToggle.addEventListener('click', DA_UI.toggleTheme);

const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomLevelBtn = document.getElementById('zoomLevelBtn');
if (zoomOutBtn) zoomOutBtn.addEventListener('click', DA_UI.zoomOut);
if (zoomInBtn) zoomInBtn.addEventListener('click', DA_UI.zoomIn);
if (zoomLevelBtn) zoomLevelBtn.addEventListener('click', DA_UI.resetZoom);

// Active notation profile indicator (header). setActive() re-paints it on
// every later profile change; this is just the first paint before any change
// has ever fired.
DA_UI.syncProfileIndicatorDisplay();
document.getElementById('profileIndicator')?.addEventListener('click', () => DA_UI.openSettings());

// Project Owner / Author Logic
const pageAuthorInput = document.getElementById('pageAuthor');
if (pageAuthorInput) {
  pageAuthorInput.value = localStorage.getItem(DA_CONSTANTS.PAGE_AUTHOR_KEY) || '';
  DA_UI.syncPassageAuthorDisplay();
  DA_UI.updateFontByAuthor();
  
  pageAuthorInput.addEventListener('input', () => {
    DA_UI.syncPassageAuthorDisplay();
    DA_UI.updateFontByAuthor();
    try { localStorage.setItem(DA_CONSTANTS.PAGE_AUTHOR_KEY, pageAuthorInput.value.trim()); } catch (_) { }
  });
}

if (projectSettingsBtn) projectSettingsBtn.addEventListener('click', DA_UI.openSettings);
if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', DA_UI.closeSettings);
if (document.getElementById('saveSettingsBtn')) {
    document.getElementById('saveSettingsBtn').addEventListener('click', DA_UI.closeSettings);
}
const settingsModal = document.getElementById('settingsModal');
if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) DA_UI.closeSettings();
  });
}

if (openReferenceGuideBtn) openReferenceGuideBtn.addEventListener('click', DA_UI.openReferenceGuide);
if (closeReferenceBtn) closeReferenceBtn.addEventListener('click', DA_UI.closeReferenceGuide);
const referenceModal = document.getElementById('referenceModal');
if (referenceModal) {
  referenceModal.addEventListener('click', (e) => {
    if (e.target === referenceModal) DA_UI.closeReferenceGuide();
  });
}


// Resize observer is set up later (line ~845) on propositionsContainer.parentElement

// Toolbar buttons are initialized later in the file with full logic.

// The visible toolbar button is #undoDivideBtn (declared above). It was wired to
// a non-existent #undoBtn, so the Undo button did nothing (only Ctrl/Cmd+Z worked).
if (undoDivideBtn) {
  undoDivideBtn.addEventListener('click', () => {
    undoLastAction();
  });
}
if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    redoLastAction();
  });
}

function undoLastAction() {
  const action = DA_STATE.undo();
  if (action) {
    renderAll();
    // The header is only ever synced manually; snapshots can change passageRef
    // (e.g. undoing an added passage restores the shorter range).
    if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
    DA_UI.showStatus(`Undo: ${action}`, 'success');
  } else {
    DA_UI.showStatus('Nothing to undo', 'info');
  }
}

function redoLastAction() {
  const action = DA_STATE.redo();
  if (action) {
    renderAll();
    if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
    DA_UI.showStatus(`Redo: ${action}`, 'success');
  } else {
    DA_UI.showStatus('Nothing to redo', 'info');
  }
}

if (reviewerNameInput) {
  const _savedReviewerName = localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || localStorage.getItem(DA_CONSTANTS.COMMENT_AUTHOR_KEY) || '';
  reviewerNameInput.value = _savedReviewerName;
  DA_PROFILES.maybeApplyGurtnerProfile(_savedReviewerName);

  reviewerNameInput.addEventListener('input', () => {
    const name = reviewerNameInput.value.trim();
    try {
      localStorage.setItem(DA_CONSTANTS.REVIEWER_NAME_KEY, name);
      localStorage.setItem(DA_CONSTANTS.COMMENT_AUTHOR_KEY, name);
    } catch (_) { }
    DA_PROFILES.maybeApplyGurtnerProfile(name);
    renderAll();
  });
}


// Toggle DA_STATE.comments visibility
if (toggleCommentsBtn) {
  const updateToggleUI = () => {
    toggleCommentsBtn.classList.toggle('active', DA_STATE.showCommentsEnabled);
    toggleCommentsBtn.textContent = DA_STATE.showCommentsEnabled ? 'Hide Comments (C)' : 'Show Comments (C)';
  };
  updateToggleUI();
  
  toggleCommentsBtn.addEventListener('click', () => {
    DA_STATE.showCommentsEnabled = !DA_STATE.showCommentsEnabled;
    updateToggleUI();
    renderAll();
  });
}

// Sidebar Buttons
if (newBracketBtn) newBracketBtn.addEventListener('click', DA_UI.handleNewBracket);
if (openMenuBtn) openMenuBtn.addEventListener('click', DA_UI.showOpenMenu);
if (saveBtn) saveBtn.addEventListener('click', () => DA_PERSISTENCE.saveBracket(false));
if (saveAsBtn) saveAsBtn.addEventListener('click', () => DA_PERSISTENCE.saveBracket(true));
if (exportMenuBtn) exportMenuBtn.addEventListener('click', DA_UI.showExportMenu);
if (clearBracketsBtn) clearBracketsBtn.addEventListener('click', () => {
  if (confirm('Clear all brackets and formatting?')) {
    DA_STATE.pushUndo('clear-all');
    clearAllFormatting();
    renderAll();
    DA_UI.showStatus('All brackets cleared.', 'success');
  }
});
if (importFileInput) {
  importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      DA_PERSISTENCE.importBracket(data);
    } catch (_) {
      DA_UI.showStatus('Could not read file.', 'error');
    }
  });
}

// Relationship types moved to constants.js


DA_KEYBOARD.initGlobalShortcuts();

// Parse passage reference for SBLGNT: "John 1:1-5" → { book, chapter, verseStart, verseEnd }
// parsePassageReference and fetchSBLGNTPassage moved to js/services/bible-service.js

// Fetch passage (ESV or SBLGNT based on version selector)
/** Non-empty diagram loaded? Same predicate as ui-dialogs' handleNewBracket. */
function hasDocumentContent() {
  return DA_STATE.propositions.length > 0 &&
    DA_STATE.propositions.some((p) => p && p.trim() && p !== '(empty)');
}

/** Fetch entry point: with a diagram open, ask add-vs-replace first. */
function requestFetchPassage() {
  if (!hasDocumentContent()) return fetchPassage('replace');
  DA_UI.showReplaceAddDialog({
    onAdd: () => fetchPassage('add'),
    onReplace: () => fetchPassage('replace')
  });
}

async function fetchPassage(mode = 'replace') {
  const versionSelect = document.getElementById('versionSelect');
  const copyrightLabel = document.getElementById('copyrightLabel');
  const version = versionSelect?.value || 'esv';
  const query = passageInput?.value?.trim() || '';

  if (!query) {
    DA_UI.showStatus('Enter a passage reference (e.g. John 1:1-5)', 'error');
    return;
  }

  fetchBtn.disabled = true;
  fetchBtn.textContent = 'Fetching…';

  try {
    const result = await DA_BIBLE.fetchPassageData(version, query);

    if (mode === 'add') {
      // Direction is document-global (body rtl-mode, arrows disabled in RTL),
      // so a mixed-direction document is not representable — block, don't warn.
      if (!!result.isRTL !== !!DA_STATE.isRTL) {
        DA_UI.showStatus('Cannot add: that text reads in the opposite direction. Fetch it as a new document instead.', 'error');
        return;
      }
      // The Greek/Hebrew font class is also document-global but purely
      // cosmetic — worth a note, not a block.
      const fontMismatch = !!propositionsContainer && (
        !!result.isGreek !== propositionsContainer.classList.contains('greek-text') ||
        !!result.isHebrew !== propositionsContainer.classList.contains('hebrew-text'));

      // Which edge do these verses belong to? Verse numbers decide; 'end' is
      // the safe fallback for anything ambiguous.
      const docCtx = DA_EDITOR.parseRefRange(DA_STATE.passageRef);
      const addCtx = DA_BIBLE.parsePassageReference(result.passageRef || query);
      const position = DA_EDITOR.detectAddPosition(docCtx, DA_STATE.verseRefs, addCtx, result.verseRefs);

      // Chapter-qualified refs ('4:1') mark chapter transitions so verse
      // suffix precompute can't collide same-numbered verses across chapters.
      // Appending a later chapter qualifies the NEW refs; prepending an
      // earlier chapter makes the bare existing refs ambiguous instead, so
      // addPassage qualifies THOSE (inside its undo snapshot).
      let verseRefs = result.verseRefs;
      let qualifyExistingWithChapter;
      if (docCtx && addCtx && typeof addCtx.chapter === 'number') {
        const docEndCh = docCtx.endChapter ?? docCtx.startChapter;
        if (position === 'end' && addCtx.chapter !== docEndCh) {
          verseRefs = result.verseRefs.map((v) => v.includes(':') ? v : `${addCtx.chapter}:${v}`);
        } else if (position === 'start' && addCtx.chapter !== docCtx.startChapter) {
          qualifyExistingWithChapter = docCtx.startChapter;
        }
      }

      const { added, warning } = DA_EDITOR.addPassage({
        propositions: result.propositions,
        verseRefs,
        passageRef: result.passageRef,
        qualifyExistingWithChapter,
        docRefCtx: docCtx,
        addRefCtx: addCtx
      }, position);

      if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
      renderAll();
      const notes = [warning, fontMismatch ? 'Note: the added text uses a different script than the document.' : null]
        .filter(Boolean).join(' ');
      DA_UI.showStatus(
        `Added ${added} verse${added === 1 ? '' : 's'} to the ${position === 'start' ? 'beginning' : 'end'}.${notes ? ' ' + notes : ''}`,
        notes ? 'info' : 'success');
      return; // copyright, script classes, RTL and the reset stay untouched
    }

    // A new passage replaces the document: one shared reset ends/forgets the
    // cloud session and clears every per-document field (brackets, comments,
    // undo/redo, parallel column, custom labels, …) before the new text lands.
    DA_STATE.resetForNewDocument({
      propositions: result.propositions,
      verseRefs: result.verseRefs,
      passageRef: result.passageRef
    });
    
    if (copyrightLabel) copyrightLabel.textContent = result.copyright;
    
    if (propositionsContainer) {
      propositionsContainer.classList.toggle('greek-text', !!result.isGreek);
      propositionsContainer.classList.toggle('hebrew-text', !!result.isHebrew);
    }

    // Hebrew passages flip the layout to right-to-left; any other version flips
    // it back. setRTL also re-renders, so brackets mirror correctly.
    DA_MODES.setRTL(!!result.isRTL);

    if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;

    renderAll();
    // ESV and NASB have a primary/fallback split (official API → Bolls);
    // other versions are always Bolls, so don't call that a "fallback".
    const usedFallback = (version === 'esv' || version === 'nasb') && result.source === 'bolls';
    const apiName = version === 'esv' ? 'ESV' : 'NASB';
    DA_UI.showStatus(usedFallback ? `Passage loaded (via Bolls — ${apiName} API unavailable).` : 'Passage loaded.', 'success');
  } catch (err) {
    DA_UI.showStatus(err.message || 'Failed to fetch passage', 'error');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.textContent = 'Fetch Passage';
  }
}

// fetchFromBolls moved to js/services/bible-service.js


// Render DA_STATE.propositions as editable blocks
function renderAll() {
  const uiState = DA_UI.saveState();
  DA_RENDERER.renderAll();
  DA_UI.restoreState(uiState);
  // Keep the block diagram in sync when it's the active view.
  if (window.DA_BLOCK && DA_BLOCK.isActive()) DA_BLOCK.render();
}
// Override the global alias to use the wrapping version (preserves UI state)
window.renderAll = renderAll;

// Event Delegation for Propositions
function initDelegatedListeners() {
  if (!propositionsContainer) {
    return;
  }
  DA_KEYBOARD.initEditorShortcuts(propositionsContainer);
  DA_MOUSE.initWorkspaceMouseHandlers(propositionsContainer, bracketCanvas, wordArrowsSvg);
}
// Duplicate event registrations removed — see lines 155-171 for canonical bindings


if (importBtn) importBtn.addEventListener('click', () => {
  const pasteText = document.getElementById('pasteText');
  if (!pasteText) return;
  const raw = pasteText.value.trim();
  if (!raw) {
    DA_UI.showStatus('Paste some text first.', 'error');
    return;
  }
  if (!hasDocumentContent()) return importPastedText(raw, 'replace');
  DA_UI.showReplaceAddDialog({
    onAdd: () => importPastedText(raw, 'add'),
    onReplace: () => importPastedText(raw, 'replace')
  });
});

function importPastedText(raw, mode) {
  const pasteText = document.getElementById('pasteText');

  // Try to parse as exported JSON bracket text
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && Array.isArray(data.propositions)) {
      if (mode === 'add') {
        // A project file carries its own brackets/comments — "adding" it
        // would silently drop them, so it may only replace.
        DA_UI.showStatus('That is a saved project file — it can only replace the document, not be added to it.', 'error');
        return;
      }
      DA_PERSISTENCE.importBracket(data);
      if (pasteText) pasteText.value = '';
      return;
    }
  } catch (e) {
    // Normal text parsing continues below if it's not JSON
  }
  const passageRefInput = document.getElementById('importPassageRef');
  const startVerseInput = document.getElementById('importStartVerse');

  if (mode === 'add') {
    // Default numbering continues from the last existing verse (chapter
    // prefix preserved) — text with its own verse markers overrides it.
    // Typing a start verse below the document's first verse is the one
    // direction signal UNMARKED text has: it routes the paste to the
    // beginning via detectAddPosition below.
    const lastSeg = (DA_STATE.verseRefs[DA_STATE.verseRefs.length - 1] || '')
      .split('-').pop().match(/^(?:(\d+):)?(\d+)/);
    const autoStart = lastSeg
      ? (lastSeg[1] ? `${lastSeg[1]}:${parseInt(lastSeg[2], 10) + 1}` : String(parseInt(lastSeg[2], 10) + 1))
      : '1';
    const startVerse = (startVerseInput?.value?.trim() || '').replace(/[^0-9a-z:]/gi, '') || autoStart;

    const parsed = DA_PASTE.parsePastedText(raw, startVerse);
    const propositions = parsed.propositions.length
      ? parsed.propositions
      : [raw.replace(/\[\d+(?::\d+)?\]\s*/g, '').trim() || raw];
    const verseRefs = parsed.propositions.length ? parsed.verseRefs : [startVerse];

    const addRefStr = passageRefInput?.value?.trim() || parsed.passageRef || '';
    const docCtx = DA_EDITOR.parseRefRange(DA_STATE.passageRef);
    const addCtx = DA_EDITOR.parseRefRange(addRefStr);
    const position = DA_EDITOR.detectAddPosition(docCtx, DA_STATE.verseRefs, addCtx, verseRefs);

    // Cross-chapter adds: same qualification rules as the fetch path.
    let finalRefs = verseRefs;
    let qualifyExistingWithChapter;
    if (docCtx && addCtx) {
      const docEndCh = docCtx.endChapter ?? docCtx.startChapter;
      if (position === 'end' && addCtx.startChapter !== docEndCh) {
        finalRefs = verseRefs.map((v) => v.includes(':') ? v : `${addCtx.startChapter}:${v}`);
      } else if (position === 'start' && addCtx.endChapter !== docCtx.startChapter) {
        qualifyExistingWithChapter = docCtx.startChapter;
      }
    }

    try {
      const { added, warning } = DA_EDITOR.addPassage({
        propositions,
        verseRefs: finalRefs,
        passageRef: addRefStr,
        qualifyExistingWithChapter,
        docRefCtx: docCtx,
        addRefCtx: addCtx
      }, position);
      if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
      renderAll();
      // One-shot inputs clear only on success — a failed add keeps the paste.
      if (pasteText) pasteText.value = '';
      if (passageRefInput) passageRefInput.value = '';
      if (startVerseInput) startVerseInput.value = '';
      const parallelHint = DA_STATE.parallelLabel
        ? ' New rows have empty parallel cells — refill via Alternate Views → Change translation.'
        : '';
      DA_UI.showStatus(
        `Added ${added} verse${added === 1 ? '' : 's'} to the ${position === 'start' ? 'beginning' : 'end'}.${warning ? ' ' + warning : ''}${parallelHint}`,
        (warning || parallelHint) ? 'info' : 'success');
    } catch (err) {
      DA_UI.showStatus(err.message || 'Could not add the pasted text.', 'error');
    }
    return;
  }

  const startVerse = (startVerseInput?.value?.trim() || '1').replace(/[^0-9a-z:]/gi, '') || '1';

  const parsed = DA_PASTE.parsePastedText(raw, startVerse);
  const usedParsed = parsed.propositions.length > 0;

  // Pasted text replaces the document: one shared reset ends/forgets the cloud
  // session and clears every per-document field before the paste lands. (This
  // branch once skipped the session reset — with a live session attached, the
  // next cloud snapshot would clobber the paste, or a manual Sync would
  // overwrite the cloud project with it.)
  DA_STATE.resetForNewDocument({
    propositions: usedParsed
      ? parsed.propositions
      : [raw.replace(/\[\d+(?::\d+)?\]\s*/g, '').trim() || raw],
    verseRefs: usedParsed ? parsed.verseRefs : [startVerse],
    // A reference detected in the paste (header line, trailing citation, or
    // Accordance per-verse prefixes) labels the passage unless the user
    // typed one.
    passageRef: passageRefInput?.value?.trim() || parsed.passageRef || 'Imported text'
  });
  if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel) copyrightLabel.textContent = '';
  if (propositionsContainer) propositionsContainer.classList.remove('greek-text');

  renderAll();
  // The import box is one-shot: clear it so a detected reference or typed
  // start verse can't leak into the next import as if the user had typed it.
  if (pasteText) pasteText.value = '';
  if (passageRefInput) passageRefInput.value = '';
  if (startVerseInput) startVerseInput.value = '';
  const detectedNote = (parsed.detection === 'lines' || parsed.detection === 'flow')
    ? `Detected ${parsed.passageRef ? `${parsed.passageRef} — ` : ''}${parsed.verseRefs.length} verse${parsed.verseRefs.length === 1 ? '' : 's'}. `
    : '';
  DA_UI.showStatus(`${detectedNote}Imported. Double-click to split a line, single-click to edit. Click the dots to create brackets.`, 'success');
}



// Paste handler for DISCOURSE_DNA is handled by DA_PERSISTENCE.initMagicPaste()


// Filename placeholder observers are set up in attachFilenameObservers() below

// Comment and Text Edit mode toggles
// (getWordAtPoint moved to DA_MOUSE)

if (textEditModeBtn) {
  textEditModeBtn.addEventListener('click', DA_MODES.toggleTextEditMode);
}

// Comment Sidebar Interactions
const commentsPreview = document.getElementById('commentsPreview');
DA_MOUSE.initSidebarMouseHandlers(commentsPreview);



if (arrowModeBtn) {
  arrowModeBtn.addEventListener('click', DA_MODES.toggleArrowMode);
}

if (alternateViewsBtn) {
  alternateViewsBtn.addEventListener('click', DA_UI.showAlternateViewsMenu);
}

// (Word arrow interaction logic moved to DA_MOUSE.initWorkspaceMouseHandlers)



if (passageInput) passageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') requestFetchPassage();
});

// Sidebar Toggles
const toggleLeftSidebarBtn = document.getElementById('toggleLeftSidebarBtn');
const leftSidebar = document.querySelector('.sidebar');

if (toggleLeftSidebarBtn && leftSidebar) {
  toggleLeftSidebarBtn.addEventListener('click', () => {
    leftSidebar.classList.toggle('sidebar-collapsed');
    toggleLeftSidebarBtn.classList.toggle('flipped');
  });
}

// Collapsible top bar: fold the fetch header to a slim strip so long passages
// get the vertical space. The chevron toggles it manually; scrolling down in
// the workspace folds it automatically and returning to the very top unfolds
// it. Only threshold CROSSINGS act, so a manual choice mid-passage isn't
// fought by every subsequent scroll event.
const appHeader = document.getElementById('appHeader');
const headerCollapseBtn = document.getElementById('headerCollapseBtn');

function setHeaderCollapsed(collapsed) {
  appHeader.classList.toggle('header-collapsed', collapsed);
  headerCollapseBtn.classList.toggle('flipped', collapsed);
  headerCollapseBtn.setAttribute('aria-expanded', String(!collapsed));
  headerCollapseBtn.title = collapsed
    ? 'Expand the top bar'
    : 'Collapse the top bar (it also folds away when you scroll down)';
}

if (appHeader && headerCollapseBtn) {
  headerCollapseBtn.addEventListener('click', () => {
    setHeaderCollapsed(!appHeader.classList.contains('header-collapsed'));
  });

  const workspaceScroller = document.getElementById('workspace');
  if (workspaceScroller) {
    const FOLD_AT = 120; // px of scroll before the header folds away
    let lastTop = workspaceScroller.scrollTop;
    workspaceScroller.addEventListener('scroll', () => {
      const top = workspaceScroller.scrollTop;
      if (lastTop < FOLD_AT && top >= FOLD_AT) setHeaderCollapsed(true);
      else if (top <= 4 && lastTop > 4) setHeaderCollapsed(false);
      lastTop = top;
    }, { passive: true });
  }
}

// Resize observer for bracket redraw
if (propositionsContainer?.parentElement) {
  const resizeObserver = new ResizeObserver(() => DA_RENDERER.updateBracketPositions());
  resizeObserver.observe(propositionsContainer.parentElement);
}

// Initial placeholder (when no passage yet)
const propEditor = document.getElementById('propositionEditor');
if (propEditor) propEditor.placeholder = 'Fetch or import a passage to start. Click in the text and press Enter to split it into a new line. Click the dots to create brackets and logical relationships.';

// Initialize Electron "Open With" support
if (window.electronAPI && typeof window.electronAPI.onOpenFile === 'function') {
  window.electronAPI.onOpenFile(async (fileContent) => {
    try {
      const data = JSON.parse(fileContent);
      if (data && Array.isArray(data.propositions)) {
        DA_PERSISTENCE.importBracket(data);
      }
    } catch (_) {
      DA_UI.showStatus('Could not open file.', 'error');
    }
  });
}

// Initialize Cloud Sync
DA_CLOUD.registerCloudRenderCallbacks({
  renderAll: () => {
    if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
    DA_RENDERER.renderAll();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Cloud sync is driven from the Export menu (toggle) and the header badge
  // (manual Sync button + click-to-copy project code).
  const manualSyncBtn = document.getElementById('manualSyncBtn');
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      try {
        const synced = await DA_CLOUD.syncToCloud();
        if (synced) {
          DA_UI.showStatus('Changes synced to cloud!', 'success');
        } else {
          DA_UI.showStatus('No active cloud session. Turn Cloud Sync on first.', 'error');
        }
      } catch (err) {
        DA_UI.showStatus('Sync failed: ' + (err.message || 'unknown error'), 'error');
      }
    });
  }
  // Click the project code to copy it to the clipboard.
  const headerProjectId = document.getElementById('headerProjectId');
  if (headerProjectId) {
    headerProjectId.addEventListener('click', () => {
      const code = headerProjectId.textContent.trim();
      if (!code || code === '----') return;
      // Select the text for visual feedback, then copy.
      const range = document.createRange();
      range.selectNodeContents(headerProjectId);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      navigator.clipboard.writeText(code)
        .then(() => DA_UI.showStatus(`Project code ${code} copied!`, 'success'))
        .catch(() => DA_UI.showStatus('Could not copy code.', 'error'));
    });
  }

  // A project ID lingers in the URL after a session. Rather than silently
  // rejoining a stale project, we prompt — but only ONE startup prompt shows:
  // a cloud "reconnect?" (when a project code is in the URL) takes priority over
  // the local "restore draft?" banner, since reconnecting loads the cloud copy
  // anyway. See DA_PERSISTENCE.initStartupRecovery.
  const urlParams = new URLSearchParams(window.location.search);
  const projectFromUrl = urlParams.get('project');

  // First-run identity prompt. Skip it when a cloud project is being offered —
  // reconnecting sets the owner from the project, so we don't stack dialogs.
  if (!projectFromUrl) DA_UI.maybeShowWelcome();

  // Initialize persistence and recovery services (one startup recovery prompt).
  DA_PERSISTENCE.renderRecentList();
  DA_PERSISTENCE.initStartupRecovery(projectFromUrl);
  DA_PERSISTENCE.initDragAndDrop();
  DA_PERSISTENCE.initMagicPaste();
  DA_PERSISTENCE.attachFilenameObservers();

  // Final initial render
  DA_RENDERER.renderAll();
});

