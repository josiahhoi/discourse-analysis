
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

let arrowHighlight;
let pendingArrowStart = null;

// Global Aliases for backward compatibility in legacy handlers
window.renderAll = () => DA_RENDERER.renderAll();
window.updateBracketPositions = () => DA_RENDERER.updateBracketPositions();
window.saveBracket = () => DA_PERSISTENCE.saveBracket();

function getCommentById(id) {
  return DA_STATE.comments.find(c => c.id === id);
}

function nextCommentId() {
  return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function clearAllFormatting() {
  DA_STATE.updateState({
    brackets: [],
    wordArrows: [],
    comments: [],
    formatTags: [],
    undoStack: [],
    bracketSelectStep: 0,
    bracketFrom: null
  });
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

// Initialize arrowHighlight div
arrowHighlight = document.createElement('div');
arrowHighlight.className = 'word-arrow-highlight';
document.body.appendChild(arrowHighlight);

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
if (saveBtn) saveBtn.addEventListener('click', () => DA_PERSISTENCE.saveBracket());
if (saveAsBtn) saveAsBtn.addEventListener('click', () => DA_PERSISTENCE.saveBracket());
if (exportMenuBtn) exportMenuBtn.addEventListener('click', DA_UI.showExportMenu);
if (clearBracketsBtn) clearBracketsBtn.addEventListener('click', () => {
  if (confirm('Clear all brackets and formatting?')) {
    DA_STATE.pushUndo('clear-all');
    DA_STATE.brackets = [];
    DA_STATE.wordArrows = [];
    DA_STATE.comments = [];
    DA_STATE.formatTags = [];
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


document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undoLastAction();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveBracket();
  }

    // --- TEXT SHIFTING MODE (Global Controls) ---
    // (Handled immediately in delegated listener)

    if (e.key === 'Escape') {
    // 1. Cancel in-progress bracket or arrow creation
    if (DA_STATE.bracketSelectStep === 1) {
      DA_STATE.bracketSelectStep = 0;
      DA_STATE.firstBracketPoint = null;
      DA_UI.clearPropositionHighlights();
      bracketCanvas?.classList.remove('connect-mode');
      DA_UI.showStatus('Bracket selection cancelled.', 'info');
      if (window.renderAll) window.renderAll();
      return;
    }
    if (DA_STATE.arrowMode && (typeof DA_STATE.pendingArrowStart !== 'undefined' && DA_STATE.pendingArrowStart !== null)) {
      DA_STATE.pendingArrowStart = null;
      DA_UI.showStatus('Arrow selection cancelled.', 'info');
      return;
    }

    // 2. Dismiss any active popovers
    const labelPicker = document.getElementById('labelPicker');
    const bracketActions = document.getElementById('bracketActions');
    const commentPopover = document.getElementById('commentPopover');
    const settingsModal = document.getElementById('settingsModal');
    
    if (labelPicker || bracketActions || commentPopover || (settingsModal && settingsModal.style.display === 'flex')) {
      if (labelPicker) labelPicker.remove();
      if (bracketActions) {
        bracketActions.remove();
        DA_UI.clearPropositionHighlights();
      }
      if (commentPopover) commentPopover.remove();
      if (settingsModal) DA_UI.closeSettings();
      return;
    }

    // 3. Exit active modes (Text Edit, Arrow, or Comment)
    if (DA_STATE.textEditMode) {
      textEditModeBtn?.click();
      return;
    }
    if (DA_STATE.arrowMode) {
      arrowModeBtn?.click();
      return;
    }
    if (DA_STATE.commentMode) {
      commentModeBtn?.click();
      return;
    }

    if (DA_STATE.selectedArrowIdx !== null) {
      DA_STATE.selectedArrowIdx = null;
      renderAll();
      return;
    }
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    // Only delete if we are not in an input field
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

    if (DA_STATE.selectedArrowIdx !== null && DA_STATE.selectedArrowIdx < DA_STATE.wordArrows.length) {
      DA_STATE.pushUndo('delete arrow');
      DA_STATE.wordArrows.splice(DA_STATE.selectedArrowIdx, 1);
      DA_STATE.selectedArrowIdx = null;
      renderAll();
      DA_UI.showStatus('Arrow removed.', 'success');
    }
  }
}, true);

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

// Event Delegation for Propositions
function initDelegatedListeners() {
  if (!propositionsContainer) {
    return;
  }
  

  propositionsContainer.addEventListener('keydown', (e) => {
    const block = e.target.closest('.proposition-block');
    if (!block) return;
    const i = parseInt(block.dataset.index, 10);
    const textSpan = block.querySelector('.proposition-text') || block;

    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed;
    const isArrowKey = e.key.startsWith('Arrow');
    
    if (hasSelection && isArrowKey && !e.shiftKey) {
      const range = sel.getRangeAt(0);
      if (textSpan.contains(range.commonAncestorContainer) || textSpan === range.commonAncestorContainer) {
          e.preventDefault();
          
          const shiftText = sel.toString();
          const srcText = DA_STATE.propositions[i];
          
          // Calculate global character offset
          const preRange = document.createRange();
          preRange.setStart(textSpan, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const startOffset = preRange.toString().length;

          let lines = srcText.split('\n');
          let currentPos = 0;
          let lineIdx = -1;
          let offsetInLine = -1;
          
          for (let j = 0; j < lines.length; j++) {
              const lineEnd = currentPos + lines[j].length;
              if (startOffset >= currentPos && startOffset <= lineEnd) {
                  lineIdx = j;
                  offsetInLine = startOffset - currentPos;
                  break;
              }
              currentPos += lines[j].length + 1; // +1 for \n
          }

          if (lineIdx === -1) return;

          DA_STATE.pushUndo('shift text');

          // 1. Remove from current line
          const lineLeading = lines[lineIdx].match(/^ +/)?.[0] || "";
          const lineContent = lines[lineIdx].substring(lineLeading.length);
          const lineOffset = Math.max(0, offsetInLine - lineLeading.length);
          
          const beforeRem = lineContent.substring(0, lineOffset);
          const afterRem = lineContent.substring(lineOffset + shiftText.length);
          lines[lineIdx] = lineLeading + (beforeRem + afterRem).replace(/\s+$/, ''); // Only trim trailing spaces

          let targetLineIdx = lineIdx;
          let newOffsetInLine = 0;

          if (e.key === 'ArrowDown') {
              targetLineIdx = lineIdx + 1;
              if (targetLineIdx >= lines.length) lines.push("");
              
              const leadingSpaces = lines[targetLineIdx].match(/^ +/)?.[0] || "";
              const rest = lines[targetLineIdx].substring(leadingSpaces.length);
              const hasContent = rest.trim().length > 0;
              lines[targetLineIdx] = leadingSpaces + shiftText + (hasContent ? "        " + rest.replace(/^\s+/, '') : "");
              newOffsetInLine = leadingSpaces.length;
          } else if (e.key === 'ArrowUp') {
              targetLineIdx = lineIdx - 1;
              if (targetLineIdx < 0) {
                  const rest = lines[0];
                  const hasContent = rest.trim().length > 0;
                  lines[0] = shiftText + (hasContent ? "        " + rest.replace(/^\s+/, '') : "");
                  targetLineIdx = 0;
                  newOffsetInLine = 0;
              } else {
                  const hasContent = lines[targetLineIdx].trim().length > 0;
                  lines[targetLineIdx] = lines[targetLineIdx].replace(/\s+$/, '') + (hasContent ? "        " : "") + shiftText;
                  newOffsetInLine = lines[targetLineIdx].length - shiftText.length;
              }
          } else if (e.key === 'ArrowLeft') {
              targetLineIdx = lineIdx;
              const leadingSpaces = lines[targetLineIdx].match(/^ +/)?.[0] || "";
              const rest = lines[targetLineIdx].substring(leadingSpaces.length);
              const hasContent = rest.trim().length > 0;
              lines[targetLineIdx] = leadingSpaces + shiftText + (hasContent ? "        " + rest.replace(/^\s+/, '') : "");
              newOffsetInLine = leadingSpaces.length;
          } else if (e.key === 'ArrowRight') {
              targetLineIdx = lineIdx;
              const leadingSpaces = lines[targetLineIdx].match(/^ +/)?.[0] || "";
              const rest = lines[targetLineIdx].substring(leadingSpaces.length);
              const hasContent = rest.trim().length > 0;
              lines[targetLineIdx] = leadingSpaces + rest.replace(/\s+$/, '') + (hasContent ? "        " : "") + shiftText;
              newOffsetInLine = lines[targetLineIdx].length - shiftText.length;
          }

          // Update state
          DA_STATE.propositions[i] = lines.join('\n');
          
          // 2. Render and restore focus/selection
          DA_STATE._forceNextRender = true;
          renderAll();
          DA_STATE._forceNextRender = false;
          
          // Calculate new global offset
          let newGlobalOffset = 0;
          for (let j = 0; j < targetLineIdx; j++) {
              newGlobalOffset += lines[j].length + 1;
          }
          newGlobalOffset += newOffsetInLine;

          requestAnimationFrame(() => {
              const targetBlock = propositionsContainer.querySelector(`.proposition-block[data-index="${i}"]`);
              const newTextSpan = targetBlock?.querySelector('.proposition-text');
              if (newTextSpan) {
                  newTextSpan.focus();
                  DA_EDITOR.setSelectionByGlobalOffset(newTextSpan, newGlobalOffset, newGlobalOffset + shiftText.length);
              }
          });
          return;
      }
    }
    if (e.key === 'Backspace') {
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const preRange = document.createRange();
          preRange.setStart(textSpan, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const preText = preRange.toString();

          // Aggressive Tab Removal: 
          // 1st backspace removes one tab (8 spaces).
          // 2nd consecutive backspace removes ALL remaining leading spaces on the line.
          const currentLine = preText.split('\n').pop();
          if (currentLine.match(/^ +$/)) {
            e.preventDefault();
            const lastBS = textSpan._lastTabBS || 0;
            const now = Date.now();
            
            // If second consecutive backspace within 1 second
            if (now - lastBS < 1000) {
              const newRange = document.createRange();
              newRange.setStart(range.startContainer, range.startOffset - currentLine.length);
              newRange.setEnd(range.startContainer, range.startOffset);
              newRange.deleteContents();
              textSpan._lastTabBS = 0;
            } else {
              const toRemove = Math.min(8, currentLine.length);
              const newRange = document.createRange();
              newRange.setStart(range.startContainer, range.startOffset - toRemove);
              newRange.setEnd(range.startContainer, range.startOffset);
              newRange.deleteContents();
              textSpan._lastTabBS = now;
            }
            return;
          }
          textSpan._lastTabBS = 0;

          // Normal logic for merging lines
          if (preText.length === 0 && i > 0) {
            e.preventDefault();
            
            // Explicitly sync the PREVIOUS block's text to state before merging
            const prevBlock = propositionsContainer.querySelector(`.proposition-block[data-index="${i - 1}"]`);
            const prevTextSpan = prevBlock?.querySelector('.proposition-text');
            if (prevTextSpan) {
              DA_STATE.propositions[i-1] = prevTextSpan.innerText;
            }

            const prevLen = DA_STATE.propositions[i - 1].length;
            DA_EDITOR.mergePropositions(i);
            renderAll();
            // Restore cursor to the join point in the previous block
            requestAnimationFrame(() => {
              const prevBlock = propositionsContainer.querySelector(`.proposition-block[data-index="${i - 1}"]`);
              const prevTextSpan = prevBlock?.querySelector('.proposition-text');
              if (prevTextSpan) {
                prevTextSpan.focus();
                DA_EDITOR.setSelectionByGlobalOffset(prevTextSpan, prevLen, prevLen);
              }
            });
            return;
          }
        }
      }
    }

    // Mode-specific behaviors
    if (DA_STATE.textEditMode) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);

        if (e.shiftKey) {
          // Shift+Tab: Un-indent
          const preRange = document.createRange();
          preRange.setStart(textSpan, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const preText = preRange.toString();
          const currentLine = preText.split('\n').pop();
          
          if (currentLine.startsWith(' ')) {
            const spaces = currentLine.match(/^ +/)[0].length;
            const toRemove = Math.min(8, spaces);
            const newRange = document.createRange();
            newRange.setStart(range.startContainer, range.startOffset - currentLine.length);
            newRange.setEnd(range.startContainer, range.startOffset - currentLine.length + toRemove);
            newRange.deleteContents();
          }
        } else {
          // Tab: Indent
          document.execCommand('insertText', false, '        ');
        }
        return;
      }
      
      // Enter in text-edit mode: Auto-indent
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        const preRange = document.createRange();
        preRange.setStart(textSpan, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preText = preRange.toString();
        
        const lines = preText.split('\n');
        const currentLine = lines[lines.length - 1];
        const match = currentLine.match(/^ +/);
        const indentation = match ? match[0] : '';
        
        document.execCommand('insertText', false, '\n' + indentation);
        return;
      }
    }

    // Global Enter behavior for Splitting (when NOT in text edit mode)
    if (e.key === 'Enter' && !e.shiftKey && !DA_STATE.textEditMode) {
      e.preventDefault();
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        const preRange = document.createRange();
        preRange.setStart(textSpan, 0);
        preRange.setEnd(range.startContainer, range.startOffset);
        const offset = preRange.toString().length;
        DA_EDITOR.splitPropositionAtOffset(i, offset);
        // Explicitly update the current block's text BEFORE renderAll.
        // The differential renderer skips focused blocks to avoid cursor disruption,
        // but a split must truncate this block to just the 'before' text.
        textSpan.textContent = DA_STATE.propositions[i];
        renderAll();
        // Move cursor to the start of the new block (i+1)
        requestAnimationFrame(() => {
          const newBlock = propositionsContainer.querySelector(`.proposition-block[data-index="${i + 1}"]`);
          const newTextSpan = newBlock?.querySelector('.proposition-text');
          if (newTextSpan) {
            newTextSpan.focus();
            DA_EDITOR.setSelectionByGlobalOffset(newTextSpan, 0, 0);
          }
        });
      }
    }
  });

  // CRITICAL: Sync text changes back to state as the user types
  propositionsContainer.addEventListener('input', (e) => {
    const textSpan = e.target.closest('.proposition-text');
    if (!textSpan) return;
    const block = textSpan.closest('.proposition-block');
    if (!block) return;
    const i = parseInt(block.dataset.index, 10);
    
    // Save raw text to state so it's not lost on re-renders
    DA_STATE.propositions[i] = textSpan.innerText;
  });

  propositionsContainer.addEventListener('click', (e) => {
    // Deselect arrow if clicking away
    if (DA_STATE.selectedArrowIdx !== null && !e.target.closest('.arrow-anchor')) {
      DA_STATE.selectedArrowIdx = null;
      renderAll();
    }

    const block = e.target.closest('.proposition-block');
    if (!block) return;
    
    if (e.target.closest('.prop-dot')) {
      const dot = e.target.closest('.prop-dot');
      const pointId = `p${dot.dataset.index}`;
      const rect = dot.getBoundingClientRect();
      DA_EDITOR.handleDotClick(pointId, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      const commentHighlight = e.target.closest('.comment-highlight');
      if (commentHighlight) {
        const commentId = commentHighlight.dataset.commentId;
        const c = getCommentById(commentId);
        if (c && c.target) {
          DA_UI.showCommentPopoverForText(c.target.propIndex, c.target.start, c.target.end, c.id);
        }
      }
    }
  });

  bracketCanvas?.addEventListener('click', (e) => {
    const node = e.target.closest('.connection-node');
    if (node) {
      const bIdx = node.dataset.bracketIdx;
      DA_EDITOR.handleDotClick(`b${bIdx}`, e.clientX, e.clientY);
      return;
    }

    const commentIcon = e.target.closest('.bracket-comment-icon');
    if (commentIcon) {
      const bIdx = parseInt(commentIcon.dataset.index, 10);
      const b = DA_STATE.brackets[bIdx];
      if (b) {
        const { topY, bottomY } = DA_RENDERER.getConnectionPoints(b.from, b.to, DA_STATE.dotPositions, bIdx);
        const x = DA_RENDERER.getBracketX(bIdx);
        DA_UI.showCommentPopoverForBracket(bIdx, (topY + bottomY) / 2, x);
      }
      return;
    }

    const group = e.target.closest('.bracket-group');
    if (group) {
      const bIdx = parseInt(group.dataset.index, 10);
      // Left click -> Jump straight to label picker for efficiency
      DA_UI.showLabelPicker(bIdx, e.clientY, e.clientX);
      return;
    }
  });

  bracketCanvas?.addEventListener('contextmenu', (e) => {
    const group = e.target.closest('.bracket-group');
    if (group) {
      e.preventDefault(); // Prevent browser context menu
      const bIdx = parseInt(group.dataset.index, 10);
      DA_UI.showBracketActions(bIdx, e.clientY, e.clientX);
    }
  });

  const wordArrowsSvg = document.getElementById('wordArrowsSvg');
  if (wordArrowsSvg) {
    wordArrowsSvg.addEventListener('click', (e) => {
      const group = e.target.closest('.word-arrow-group');
      if (group) {
        const i = parseInt(group.dataset.index, 10);
        if (!isNaN(i)) {
          DA_STATE.selectedArrowIdx = (DA_STATE.selectedArrowIdx === i) ? null : i;
          renderAll();
        }
      } else {
        if (DA_STATE.selectedArrowIdx !== null) {
          DA_STATE.selectedArrowIdx = null;
          renderAll();
        }
      }
    });

    wordArrowsSvg.addEventListener('mouseover', (e) => {
      const group = e.target.closest('.word-arrow-group');
      if (group) {
        const idx = group.dataset.index;
        const anchors = document.querySelectorAll(`.arrow-anchor[data-arrow-id^="arrow-${idx}-"]`);
        anchors.forEach(a => a.classList.add('hover-anchor'));
      }
    });

    wordArrowsSvg.addEventListener('mouseout', (e) => {
      const group = e.target.closest('.word-arrow-group');
      if (group) {
        const idx = group.dataset.index;
        const anchors = document.querySelectorAll(`.arrow-anchor[data-arrow-id^="arrow-${idx}-"]`);
        anchors.forEach(a => a.classList.remove('hover-anchor'));
      }
    });
  }
}
// Duplicate event registrations removed — see lines 155-171 for canonical bindings


if (importBtn) importBtn.addEventListener('click', () => {
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
  renderAll();
  DA_UI.showStatus('Imported. Double-click in text to split / single click to edit. Use nodes or verse refs for DA_STATE.brackets.', 'success');
});

// Export / Import bracket as JSON file + Recent list
DA_PERSISTENCE.renderRecentList();
DA_PERSISTENCE.attachFilenameObservers();

// Event listeners for save/export/open are registered above (lines 155-160) — not duplicated here

document.addEventListener('paste', async (e) => {
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('DISCOURSE_DNA:')) return;
  }
  let encoded = null;
  for (const type of e.clipboardData.types) {
    const content = e.clipboardData.getData(type);
    if (content && content.includes('DISCOURSE_DNA:')) {
      const match = content.match(/DISCOURSE_DNA:([^"\s>]+)/);
      if (match) { encoded = match[1]; break; }
    }
  }
  if (encoded) {
    e.preventDefault();
    DA_PERSISTENCE.processDNA(encoded);
  }
});


// Filename placeholder observers are set up in attachFilenameObservers() below

// Comment and Text Edit mode toggles
function getWordAtPoint(e) {
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
  textEditModeBtn.addEventListener('click', DA_MODES.toggleTextEditMode);
}

// Comment Sidebar Interactions
const commentsPreview = document.getElementById('commentsPreview');
if (commentsPreview) {
  commentsPreview.addEventListener('click', (e) => {
    const card = e.target.closest('.comments-preview-card');
    if (!card) return;
    const commentId = card.dataset.commentId;
    const comment = DA_STATE.comments.find(c => c.id === commentId);
    if (!comment) return;

    // Delete Button
    if (e.target.closest('.delete-comment-btn')) {
      if (confirm('Delete this comment?')) {
        DA_STATE.pushUndo('delete comment');
        DA_STATE.comments = DA_STATE.comments.filter(c => c.id !== commentId);
        renderAll();
      }
      return;
    }

    // Send Reply Button or Input
    if (e.target.closest('.send-reply-btn') || e.target.closest('.reply-input')) {
      if (e.target.closest('.send-reply-btn')) {
        const input = card.querySelector('.reply-input');
        const text = input?.value?.trim();
        if (text) {
          DA_STATE.pushUndo('add reply');
          comment.replies = comment.replies || [];
          comment.replies.push({
            author: (localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || 'Guest').trim(),
            text,
            timestamp: Date.now()
          });
          renderAll();
        }
      }
      return;
    }

    // Clicking the card itself highlights the target AND opens the popover
    if (comment.type === 'text') {
      const block = document.querySelector(`.proposition-block[data-index="${comment.target.propIndex}"]`);
      if (block) {
        block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        block.classList.add('searching');
        setTimeout(() => block.classList.remove('searching'), 2000);
        
        // Open Popover
        DA_UI.showCommentPopoverForText(comment.target.propIndex, comment.target.start, comment.target.end, comment.id);
      }
    } else if (comment.type === 'bracket') {
      const bracketIdx = comment.target.bracketIdx;
      const bracketGroup = document.querySelector(`.bracket-group[data-index="${bracketIdx}"]`);
      if (bracketGroup) {
        bracketGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
        bracketGroup.classList.add('bracket-hover');
        setTimeout(() => bracketGroup.classList.remove('bracket-hover'), 2000);

          // Open Popover
          const b = DA_STATE.brackets[bracketIdx];
          if (b) {
            const { topY, bottomY } = DA_RENDERER.getConnectionPoints(b.from, b.to, DA_STATE.dotPositions, bracketIdx);
            const x = DA_RENDERER.getBracketX(bracketIdx);
            DA_UI.showCommentPopoverForBracket(bracketIdx, (topY + bottomY) / 2, x);
          }
      }
    }
  });

  commentsPreview.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('reply-input')) {
      const card = e.target.closest('.comments-preview-card');
      const commentId = card.dataset.commentId;
      const comment = DA_STATE.comments.find(c => c.id === commentId);
      const text = e.target.value.trim();
      if (comment && text) {
        DA_STATE.pushUndo('add reply');
        comment.replies = comment.replies || [];
        comment.replies.push({
          author: (document.getElementById('reviewerName')?.value || 'Guest').trim(),
          text,
          createdAt: new Date().toISOString()
        });
        renderAll();
      }
    }
  });
}



if (arrowModeBtn) {
  arrowModeBtn.addEventListener('click', DA_MODES.toggleArrowMode);
}

// Text selection and word arrow interaction
if (propositionsContainer) {
  propositionsContainer.addEventListener('mousemove', (e) => {
    if (!DA_STATE.arrowMode) return;
    const word = getWordAtPoint(e);
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
    if (!DA_STATE.arrowMode) return;
    const word = getWordAtPoint(e);
    if (!word) return;

    if (!pendingArrowStart) {
      pendingArrowStart = word;
      DA_UI.showStatus('Start word selected. Now click the target word.', 'success');
    } else {
      if (pendingArrowStart.propIndex === word.propIndex && pendingArrowStart.start === word.start) {
        pendingArrowStart = null;
        DA_UI.showStatus('Arrow cancelled.', 'info');
        return;
      }
      DA_STATE.pushUndo('add arrow');
      DA_STATE.wordArrows.push({
        fromProp: pendingArrowStart.propIndex,
        fromStart: pendingArrowStart.start,
        fromEnd: pendingArrowStart.end,
        toProp: word.propIndex,
        toStart: word.start,
        toEnd: word.end
      });
      pendingArrowStart = null;
      renderAll();
      DA_UI.showStatus('Arrow created.', 'success');
    }
  });

  propositionsContainer.addEventListener('contextmenu', (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    
    const range = sel.getRangeAt(0);
    let startNode = range.startContainer;
    if (startNode.nodeType === Node.TEXT_NODE) startNode = startNode.parentElement;
    
    const textSpan = startNode.closest?.('.proposition-text');
    if (!textSpan) return;
    
    e.preventDefault(); // Prevent browser context menu
    
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
    DA_UI.showTextContextMenu(propIndex, start, end, e.clientY, e.clientX, anchorRect);
  });

}



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
  window.electronAPI.onOpenFile(async (filePath) => {
    try {
      const data = JSON.parse(filePath);
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

