
// DOM Elements
const propositionsContainer = document.getElementById('propositions');
const bracketCanvas = document.getElementById('bracketCanvas');
const wordArrowsSvg = document.getElementById('wordArrowsSvg');
const versionSelect = document.getElementById('versionSelect');
const passageInput = document.getElementById('passageInput');
const fetchBtn = document.getElementById('fetchBtn');
if (fetchBtn) {
  fetchBtn.addEventListener('click', fetchPassage);
}
initDelegatedListeners();
const passageRefEl = document.getElementById('passageRef');
const apiKeyInput = document.getElementById('apiKey');
const apiKeyRow = document.getElementById('apiKeyRow');
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
const textEditModeBtn = document.getElementById('textEditModeBtn');
const commentModeBtn = document.getElementById('commentModeBtn');
const arrowModeBtn = document.getElementById('arrowModeBtn');
const openFileBtn = document.getElementById('openFileBtn');
const openMenuBtn = document.getElementById('openMenuBtn');
const reviewerNameInput = document.getElementById('reviewerName');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const openReferenceGuideBtn = document.getElementById('openReferenceGuideBtn');
const closeReferenceBtn = document.getElementById('closeReferenceBtn');
// arrowHighlight and pendingArrowStart are managed on window.* by mouse-handler.js

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

if (themeToggle) themeToggle.addEventListener('click', DA_UI.toggleTheme);

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

const undoBtn = document.getElementById('undoBtn');
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    undoLastAction();
  });
}

function undoLastAction() {
  const action = DA_STATE.undo();
  if (action) {
    renderAll();
    DA_UI.showStatus(`Undo: ${action}`, 'success');
  } else {
    DA_UI.showStatus('Nothing to undo', 'info');
  }
}

if (reviewerNameInput) {
  reviewerNameInput.value = localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || localStorage.getItem(DA_CONSTANTS.COMMENT_AUTHOR_KEY) || '';
  reviewerNameInput.addEventListener('input', () => {
    try { 
      localStorage.setItem(DA_CONSTANTS.REVIEWER_NAME_KEY, reviewerNameInput.value.trim());
      // Also update comment author key for consistency with existing code
      localStorage.setItem(DA_CONSTANTS.COMMENT_AUTHOR_KEY, reviewerNameInput.value.trim());
    } catch (_) { }
    // Update labels immediately if Gurtner mode is toggled
    renderAll();
  });
}


// Toggle DA_STATE.comments visibility
if (toggleCommentsBtn) {
  const updateToggleUI = () => {
    toggleCommentsBtn.classList.toggle('active', DA_STATE.showCommentsEnabled);
    toggleCommentsBtn.textContent = DA_STATE.showCommentsEnabled ? 'Hide Comments' : 'Show Comments';
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
if (openFileBtn && importFileInput) {
  openFileBtn.addEventListener('click', () => importFileInput.click());
}
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
async function fetchPassage() {
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
    const key = apiKeyInput?.value?.trim() || '';
    const result = await DA_BIBLE.fetchPassageData(version, query, key);

    DA_STATE.propositions = result.propositions;
    DA_STATE.verseRefs = result.verseRefs;
    DA_STATE.passageRef = result.passageRef;
    
    if (copyrightLabel) copyrightLabel.textContent = result.copyright;
    
    if (propositionsContainer) {
      if (result.isGreek) propositionsContainer.classList.add('greek-text');
      else propositionsContainer.classList.remove('greek-text');
    }

    if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;

    clearAllFormatting();
    DA_STATE.undoStack = [];
    renderAll();
    DA_UI.showStatus('Passage loaded.', 'success');
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

  // Try to parse as exported JSON bracket text
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && Array.isArray(data.propositions)) {
      DA_PERSISTENCE.importBracket(data);
      pasteText.value = '';
      return;
    }
  } catch (e) {
    // Normal text parsing continues below if it's not JSON
  }
  const passageRefInput = document.getElementById('importPassageRef');
  const startVerseInput = document.getElementById('importStartVerse');
  const startVerse = (startVerseInput?.value?.trim() || '1').replace(/[^0-9a-z:]/gi, '') || '1';

  const parsed = DA_UI.parsePastedText(raw, startVerse);
  if (parsed.propositions.length > 0) {
    DA_STATE.propositions = parsed.propositions;
    DA_STATE.verseRefs = parsed.verseRefs;
  } else {
    DA_STATE.propositions = [raw.replace(/\[\d+(?::\d+)?\]\s*/g, '').trim() || raw];
    DA_STATE.verseRefs = [startVerse];
  }
  DA_STATE.passageRef = passageRefInput?.value?.trim() || 'Imported text';
  if (passageRefEl) passageRefEl.textContent = DA_STATE.passageRef;
  const copyrightLabel = document.getElementById('copyrightLabel');
  if (copyrightLabel) copyrightLabel.textContent = '';
  if (propositionsContainer) propositionsContainer.classList.remove('greek-text');
  
  clearAllFormatting();
  DA_STATE.undoStack = [];
  renderAll();
  DA_UI.showStatus('Imported. Double-click to split a line, single-click to edit. Click the dots to create brackets.', 'success');
});



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

// (Word arrow interaction logic moved to DA_MOUSE.initWorkspaceMouseHandlers)



if (passageInput) passageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchPassage();
});

// Sidebar Toggles
const toggleLeftSidebarBtn = document.getElementById('toggleLeftSidebarBtn');
const leftSidebar = document.querySelector('.sidebar');

if (toggleLeftSidebarBtn && leftSidebar) {
  toggleLeftSidebarBtn.addEventListener('click', () => {
    leftSidebar.classList.toggle('sidebar-hidden');
    toggleLeftSidebarBtn.classList.toggle('flipped');
  });
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
  const startBtn = document.getElementById('startCloudBtn');
  const stopBtn = document.getElementById('stopCloudBtn');
  const joinBtn = document.getElementById('joinCloudBtn');
  const copyBtn = document.getElementById('copyCloudUrlBtn');
  const joinInput = document.getElementById('joinCloudId');

  const manualSyncBtn = document.getElementById('manualSyncBtn');
  if (startBtn) startBtn.addEventListener('click', DA_CLOUD.startCloudSync);
  if (stopBtn) stopBtn.addEventListener('click', DA_CLOUD.stopCloudSync);
  if (joinBtn) joinBtn.addEventListener('click', () => DA_CLOUD.joinCloudSync(joinInput.value.trim().toUpperCase()));
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      await DA_CLOUD.syncToCloud();
      DA_UI.showStatus('Changes synced to cloud!', 'success');
    });
  }
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => DA_UI.showStatus('Link copied!', 'success'));
  });

  // Check URL for existing project
  const urlParams = new URLSearchParams(window.location.search);
  const projectFromUrl = urlParams.get('project');
  if (projectFromUrl) {
    setTimeout(() => DA_CLOUD.joinCloudSync(projectFromUrl), 1000);
  }
  
  // Initialize persistence and recovery services
  DA_PERSISTENCE.renderRecentList();
  DA_PERSISTENCE.initDraftRecovery();
  DA_PERSISTENCE.initDragAndDrop();
  DA_PERSISTENCE.initMagicPaste();
  DA_PERSISTENCE.attachFilenameObservers();

  // Final initial render
  DA_RENDERER.renderAll();
});

