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
  
  // Helpers
  updateState: function(newData) {
    Object.assign(window.DA_STATE, newData);
  },
  
  pushUndo: function(action) {
    const s = window.DA_STATE;
    s.undoStack.push({
      action,
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
      indentation: s.indentation.slice()
    });
    if (s.undoStack.length > 50) s.undoStack.shift();
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
    
    return snapshot.action;
  }
};

// Alias for convenience
window.pushUndo = window.DA_STATE.pushUndo;
