/**
 * ESLint config (flat). The app ships as classic (non-module) scripts that share
 * one global scope, so functions/consts defined at the top level of one file are
 * used freely by later files. ESLint checks files in isolation, so every
 * cross-file name is declared below — which doubles as documentation of the
 * app's global surface. If you define a new top-level function in one file and
 * use it in another, add it to APP_GLOBALS or lint will flag it (that's the
 * point: a typo'd or deleted name gets flagged the same way).
 */
const globals = require('globals');

// Names defined by one renderer script and used by another (classic-script
// top-level function/const declarations), grouped by defining file.
const APP_GLOBALS = {
  // vendored libs + firebase (index.html <script> tags)
  LZString: 'readonly', html2canvas: 'readonly', jspdf: 'readonly',
  firebase: 'readonly', db: 'readonly',
  // namespaces (window.DA_* assignments)
  DA_STATE: 'readonly', DA_CONSTANTS: 'readonly', DA_PROFILES: 'readonly',
  DA_UI: 'readonly', DA_NOTATION: 'readonly', DA_PERSISTENCE: 'readonly', DA_PASTE: 'readonly',
  DA_MODES: 'readonly', DA_BIBLE: 'readonly', DA_CLOUD: 'readonly',
  DA_EDITOR: 'readonly', DA_RENDERER: 'readonly', DA_EXPORT: 'readonly',
  DA_KEYBOARD: 'readonly', DA_MOUSE: 'readonly', DA_BLOCK: 'readonly',
  // app.js
  undoLastAction: 'readonly', redoLastAction: 'readonly', fetchPassage: 'readonly',
  // window.* aliases set in app.js / state.js
  renderAll: 'readonly', saveBracket: 'readonly', pushUndo: 'readonly',
  scheduleVisualUpdate: 'readonly', updateBracketPositions: 'readonly',
  // mouse-handler.js window.* state
  arrowHighlight: 'writable', pendingArrowStart: 'writable',
  // ui.js
  showStatus: 'readonly', updateCloudUI: 'readonly', escapeHtml: 'readonly',
  renderCommentText: 'readonly', applyFormatting: 'readonly',
  setupClickOutside: 'readonly', clearPropositionHighlights: 'readonly',
  getCommentForBracket: 'readonly', addReplyToComment: 'readonly',
  clampToViewport: 'readonly', makeFixedDraggable: 'readonly',
  makePopupDraggable: 'readonly', makeCommentPopoverDraggableAndResizable: 'readonly',
  manageDialogFocus: 'readonly',
  // ui-comments.js
  showCommentPopover: 'readonly', showCommentPopoverForText: 'readonly',
  showCommentPopoverForBracket: 'readonly',
  // ui-menus.js
  showBracketActions: 'readonly', showTextContextMenu: 'readonly',
  showLabelPicker: 'readonly', showExportMenu: 'readonly', showOpenMenu: 'readonly',
  openBracketFile: 'readonly', showCustomLabelDialog: 'readonly',
  // ui-dialogs.js
  saveState: 'readonly', restoreState: 'readonly', showMagicPasteBanner: 'readonly',
  initTheme: 'readonly', toggleTheme: 'readonly', updateThemeButtonText: 'readonly',
  initZoom: 'readonly', applyZoom: 'readonly', setZoomLevel: 'readonly',
  zoomIn: 'readonly', zoomOut: 'readonly', resetZoom: 'readonly', getZoomFactor: 'readonly',
  openSettings: 'readonly', closeSettings: 'readonly', openReferenceGuide: 'readonly',
  closeReferenceGuide: 'readonly', maybeShowWelcome: 'readonly',
  updateFontByAuthor: 'readonly', syncPassageAuthorDisplay: 'readonly',
  handleNewBracket: 'readonly', startNewBracket: 'readonly',
  parsePastedText: 'readonly', formatBracketType: 'readonly',
  populateReferenceGuide: 'readonly',
  // rendering-engine.js + its split-out siblings
  // (render-model.js / render-propositions.js / render-brackets.js)
  createSVG: 'readonly', createLabelText: 'readonly', renderPropositions: 'readonly',
  renderBrackets: 'readonly', computeSlotAssignments: 'readonly',
  getBracketX: 'readonly', getGutterPadding: 'readonly',
  getConnectionPoints: 'readonly', getPointExtent: 'readonly',
  getExtent: 'readonly', getBracketExtent: 'readonly',
  getRepresentativeRange: 'readonly', computeVerseDisplay: 'readonly',
  precomputeVerseSuffixes: 'readonly', clampToWordAnchor: 'readonly',
  remapPropositionAnchors: 'readonly',
  getCollapseInfo: 'readonly', _isJumpOverType: 'readonly', _zoom: 'readonly',
  // render-labels.js / render-arrows.js / render-comments.js
  getBracketLabels: 'readonly', renderWordArrows: 'readonly',
  renderCommentPreviews: 'readonly',
  // bible-service.js
  parsePassageReference: 'readonly', parseBollsText: 'readonly',
  fetchFromBolls: 'readonly', fetchSBLGNTPassage: 'readonly',
  fetchFromESVApi: 'readonly', fetchPassageData: 'readonly',
  // persistence.js
  importBracket: 'readonly', normalizeBracketData: 'readonly',
  saveDraft: 'readonly', clearDraft: 'readonly', getDraft: 'readonly',
  addToRecent: 'readonly', getRecentBrackets: 'readonly',
  saveRecentBrackets: 'readonly', renderRecentList: 'readonly',
  getExportFilename: 'readonly', getBookAbbreviation: 'readonly',
  updateFilenamePlaceholder: 'readonly', attachFilenameObservers: 'readonly',
  initMagicPaste: 'readonly', initDraftRecovery: 'readonly',
  initStartupRecovery: 'readonly', showCloudReconnectBanner: 'readonly',
  injectPngMetadata: 'readonly', extractPngMetadata: 'readonly',
  extractPdfMetadata: 'readonly', processDNA: 'readonly', crc32: 'readonly',
  exportBracket: 'readonly', initDragAndDrop: 'readonly',
  // cloud-sync.js
  registerCloudRenderCallbacks: 'readonly', startCloudSync: 'readonly',
  joinCloudSync: 'readonly', initCloudSync: 'readonly', handleCloudData: 'readonly',
  syncToCloud: 'readonly', updateSyncUI: 'readonly', stopCloudSync: 'readonly',
  // mode-service.js
  toggleTextEditMode: 'readonly', toggleArrowMode: 'readonly', setRTL: 'readonly',
  applyScriptDirection: 'readonly',
};

const RULES = {
  'no-undef': 'error',
  'no-unused-vars': ['error', {
    args: 'none',                    // unused function args are common & harmless here
    caughtErrors: 'none',            // catch (_) {} pattern is used deliberately
    varsIgnorePattern: '^_',         // _foo convention for intentionally unused
    ignoreRestSiblings: true,        // const { pwHash, ...rest } omit-pattern
  }],
  // These top-level functions are consumed cross-file, so "defined but never
  // used in this file" is expected; no-unused-vars can't know that. The rule
  // stays on for vars; functions exported via window.X = or Object.assign are
  // "used". Anything genuinely dead shows up as unused here.
  // builtinGlobals:false — a file *defining* one of the APP_GLOBALS above is the
  // normal classic-script pattern, not a redeclaration. Same-file duplicates
  // are still caught.
  'no-redeclare': ['error', { builtinGlobals: false }],
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'eqeqeq': 'off',                   // codebase uses == null idioms; not worth churning
};

module.exports = [
  {
    ignores: ['js/vendor/**', 'dist/**', 'node_modules/**', 'scratch/**'],
  },
  {
    // Renderer: classic scripts sharing the browser global scope.
    files: ['app.js', 'js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...APP_GLOBALS },
    },
    rules: RULES,
  },
  {
    // Electron main process + preload: Node.
    files: ['main.js', 'preload.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: RULES,
  },
  {
    // Tests: Node + the sandbox harness.
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: RULES,
  },
  {
    // Playwright e2e: Node test runner, but page.evaluate() callbacks execute
    // in the browser, so those files see both worlds.
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: RULES,
  },
];
