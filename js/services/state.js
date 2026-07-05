/**
 * Discourse Analysis State Management
 * Global Namespace: window.DA_STATE
 */

window.DA_STATE = {
  passageRef: '',
  propositions: [],
  verseRefs: [],
  brackets: [],
  bracketSelectStep: 0,
  bracketFrom: null,
  firstBracketPoint: null,
  connectBracketToBracketIdx: null,
  _connectCancelListener: null,
  undoStack: [],
  comments: [],
  isRenderingPropositions: false,
  textEditMode: false,
  formatTags: [],
  arrowMode: false,
  wordArrows: [],
  selectedArrowIdx: null,
  pendingArrowStart: null,
  showCommentsEnabled: false,
  indentation: [],
  activeCommentTarget: null,
  bracketHighlights: {},
  customLabels: [], // Session/Project-specific labels
  // User's personal bank. Guarded: this runs at module load, so a corrupted
  // localStorage value must not throw and take DA_STATE (the whole app) down.
  savedCustomLabels: (function () {
    try {
      const parsed = JSON.parse(localStorage.getItem('da_custom_labels') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  })(),

  activeProjectId: null,
  cloudUnsubscribe: null,
  isUpdatingFromCloud: false,
  cloudDirty: false, // true when local edits haven't been pushed to the cloud

  // Set automatically to true when a Hebrew passage is loaded; reset to false for
  // all other languages. Not persisted — language choice drives RTL, not a toggle.
  isRTL: false,
  
  // Text Shifting Mode
  shiftModeActive: false,
  shiftSourceIndex: null,
  shiftSourceStartOffset: null,
  shiftSourceEndOffset: null,
  shiftText: "",
  shiftTargetIndex: null,
  shiftTargetPosition: 'end', // 'start' or 'end'
  
  // ── Bracket identity ────────────────────────────────────────────────────
  // Brackets are referenced by STABLE ID, never by array position. A reference
  // (bracket.from / bracket.to / firstBracketPoint) is either 'pN' — the
  // proposition at index N — or a bracket's id. Because ids never change,
  // deleting or reordering brackets requires no renumbering of references,
  // comments, or highlights. (Legacy 'bN' index refs are converted on load by
  // DA_PERSISTENCE.normalizeBracketData.)

  /** Generate a unique bracket id. 'br' prefix guarantees it can't parse as 'pN'. */
  newBracketId: function () {
    return 'br' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /** True if the reference points at a proposition ('pN'), false if a bracket id. */
  isPropRef: function (ref) {
    return typeof ref === 'string' && /^p\d+$/.test(ref);
  },

  bracketById: function (id) {
    return window.DA_STATE.brackets.find((b) => b && b.id === id) || null;
  },

  bracketIndexById: function (id) {
    return window.DA_STATE.brackets.findIndex((b) => b && b.id === id);
  },

  // Helpers
  updateState: function(newData) {
    Object.assign(window.DA_STATE, newData);
  },
  
  lastUndoTime: 0,
  
  pushUndo: function(action, debounceKey = '') {
    const s = window.DA_STATE;
    const now = Date.now();

    // Debounce rapid identical actions keyed on both action name and affected index
    if (s.undoStack.length > 0) {
      const lastSnapshot = s.undoStack[s.undoStack.length - 1];
      if (lastSnapshot.action === action && lastSnapshot._debounceKey === debounceKey && now - s.lastUndoTime < 1000) {
        s.lastUndoTime = now;
        return;
      }
    }

    s.undoStack.push({
      action,
      _debounceKey: debounceKey,
      propositions: s.propositions.slice(),
      verseRefs: s.verseRefs.slice(),
      brackets: s.brackets.map(a => ({ ...a })),
      formatTags: s.formatTags.map(t => ({ ...t })),
      wordArrows: s.wordArrows.map(w => ({ ...w })),
      comments: s.comments.map(c => ({
        ...c,
        target: c.target ? { ...c.target } : c.target,
        replies: c.replies ? c.replies.map(r => ({ ...r })) : []
      })),
      indentation: s.indentation.slice(),
      bracketHighlights: Object.assign({}, s.bracketHighlights),
      customLabels: s.customLabels.map(cl => ({ ...cl })),
      bracketSelectStep: s.bracketSelectStep,
      firstBracketPoint: s.firstBracketPoint
    });
    if (s.undoStack.length > 50) s.undoStack.shift();
    s.lastUndoTime = now;

    // Any undoable action means local state now differs from the cloud copy.
    // (Debounced repeats return early above, but the flag was already set by the
    // first call and stays set until the next successful sync, so that's fine.)
    s.cloudDirty = true;
    if (window.DA_CLOUD && DA_CLOUD.updateSyncUI) DA_CLOUD.updateSyncUI();
  },

  undo: function() {
    const s = window.DA_STATE;
    if (s.undoStack.length === 0) return null;
    const snapshot = s.undoStack.pop();

    // Restore state
    s.propositions = snapshot.propositions;
    s.verseRefs = snapshot.verseRefs;
    s.brackets = snapshot.brackets;
    s.formatTags = snapshot.formatTags;
    s.wordArrows = snapshot.wordArrows;
    s.comments = snapshot.comments;
    s.indentation = snapshot.indentation || [];
    s.bracketHighlights = snapshot.bracketHighlights || {};
    s.customLabels = snapshot.customLabels || [];
    s.bracketSelectStep = snapshot.bracketSelectStep ?? 0;
    s.firstBracketPoint = snapshot.firstBracketPoint ?? null;

    return snapshot.action;
  }
};

// Alias for convenience
window.pushUndo = window.DA_STATE.pushUndo;
