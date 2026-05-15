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
  commentMode: false,
  textEditMode: false,
  formatTags: [],
  arrowMode: false,
  wordArrows: [],
  selectedArrowIdx: null,
  pendingArrowStart: null,
  showCommentsEnabled: false,
  indentation: [],
  activeCommentTarget: null,
  customLabels: [], // Session/Project-specific labels
  savedCustomLabels: JSON.parse(localStorage.getItem('da_custom_labels') || '[]'), // User's personal bank

  activeProjectId: null,
  cloudUnsubscribe: null,
  isUpdatingFromCloud: false,
  
  // Text Shifting Mode
  shiftModeActive: false,
  shiftSourceIndex: null,
  shiftSourceStartOffset: null,
  shiftSourceEndOffset: null,
  shiftText: "",
  shiftTargetIndex: null,
  shiftTargetPosition: 'end', // 'start' or 'end'
  
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
      bracketSelectStep: s.bracketSelectStep,
      firstBracketPoint: s.firstBracketPoint
    });
    if (s.undoStack.length > 50) s.undoStack.shift();
    s.lastUndoTime = now;
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
    s.bracketSelectStep = snapshot.bracketSelectStep ?? 0;
    s.firstBracketPoint = snapshot.firstBracketPoint ?? null;

    return snapshot.action;
  }
};

// Alias for convenience
window.pushUndo = window.DA_STATE.pushUndo;
