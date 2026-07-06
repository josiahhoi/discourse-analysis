/**
 * Discourse Analysis State Management
 * Global Namespace: window.DA_STATE
 */

window.DA_STATE = {
  passageRef: '',
  propositions: [],
  verseRefs: [],
  // Structured verse boundaries: verseBreaks[i] is a sorted list of character
  // offsets into propositions[i] where a LATER verse begins (empty for most
  // lines). With verseRefs[i] === '3-5', verse 3 starts at 0, verse 4 at
  // verseBreaks[i][0], verse 5 at verseBreaks[i][1]. This replaces the old
  // scheme of hiding an invisible \u200B marker inside the text itself, which
  // any ordinary retype/paste could silently destroy. Legacy files are
  // migrated on load (DA_PERSISTENCE.normalizeBracketData).
  verseBreaks: [],
  brackets: [],
  bracketSelectStep: 0,
  bracketFrom: null,
  firstBracketPoint: null,
  connectBracketToBracketIdx: null,
  _connectCancelListener: null,
  undoStack: [],
  redoStack: [],
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

  /** Deep-copy the current persistent state into a labeled snapshot. Shared by
   *  pushUndo (before an action) and undo/redo (to capture the state being
   *  left, so the opposite operation can bring it back). */
  _snapshot: function(action, debounceKey) {
    const s = window.DA_STATE;
    return {
      action,
      _debounceKey: debounceKey,
      propositions: s.propositions.slice(),
      verseRefs: s.verseRefs.slice(),
      verseBreaks: s.verseBreaks.map(a => (a || []).slice()),
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
    };
  },

  /** Apply a snapshot's fields onto live state. Shared by undo and redo. */
  _restore: function(snapshot) {
    const s = window.DA_STATE;
    s.propositions = snapshot.propositions;
    s.verseRefs = snapshot.verseRefs;
    s.verseBreaks = snapshot.verseBreaks || [];
    s.brackets = snapshot.brackets;
    s.formatTags = snapshot.formatTags;
    s.wordArrows = snapshot.wordArrows;
    s.comments = snapshot.comments;
    s.indentation = snapshot.indentation || [];
    s.bracketHighlights = snapshot.bracketHighlights || {};
    s.customLabels = snapshot.customLabels || [];
    s.bracketSelectStep = snapshot.bracketSelectStep ?? 0;
    s.firstBracketPoint = snapshot.firstBracketPoint ?? null;
  },

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

    s.undoStack.push(s._snapshot(action, debounceKey));
    if (s.undoStack.length > 50) s.undoStack.shift();
    s.lastUndoTime = now;

    // A fresh action starts a new branch of history — any steps reachable by
    // redo belonged to the branch we just left, so they're discarded (matches
    // standard undo/redo behavior in other editors).
    if (s.redoStack.length) s.redoStack = [];

    // Any undoable action means local state now differs from the cloud copy —
    // tell the session service (live → live-dirty; no-op when not live).
    // Fallback for isolated tests where the cloud module isn't loaded.
    if (window.DA_CLOUD && DA_CLOUD.markDirty) DA_CLOUD.markDirty();
    else s.cloudDirty = true;
  },

  undo: function() {
    const s = window.DA_STATE;
    if (s.undoStack.length === 0) return null;
    const snapshot = s.undoStack.pop();

    // Capture the state being left (tagged with the action about to be undone)
    // so redo can bring it back.
    s.redoStack.push(s._snapshot(snapshot.action, snapshot._debounceKey));
    if (s.redoStack.length > 50) s.redoStack.shift();

    s._restore(snapshot);
    return snapshot.action;
  },

  redo: function() {
    const s = window.DA_STATE;
    if (s.redoStack.length === 0) return null;
    const snapshot = s.redoStack.pop();

    // Capture the state being left back onto the undo stack, so a subsequent
    // undo can reverse this redo.
    s.undoStack.push(s._snapshot(snapshot.action, snapshot._debounceKey));
    if (s.undoStack.length > 50) s.undoStack.shift();

    s._restore(snapshot);
    return snapshot.action;
  }
};

// Alias for convenience
window.pushUndo = window.DA_STATE.pushUndo;
