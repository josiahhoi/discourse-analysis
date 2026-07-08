// The floating word-highlight overlay for arrow mode. Module state (not
// window.*) so mode exits can reliably hide it via hideArrowHighlight().
let _arrowHighlight = null;

window.DA_MOUSE = {
  hideArrowHighlight: function() {
    if (_arrowHighlight) _arrowHighlight.style.display = 'none';
  },

  /**
   * Second click of arrow creation. Always consumes the pending start; returns
   * 'cancelled' (clicked the start word again), 'duplicate' (an arrow with these
   * exact anchors already exists — direction matters, so the reverse is allowed),
   * or 'created'.
   */
  completeArrow: function(start, word) {
    DA_STATE.pendingArrowStart = null;
    if (start.propIndex === word.propIndex && start.start === word.start) {
      return 'cancelled';
    }
    const isDuplicate = DA_STATE.wordArrows.some(wa =>
      wa.fromProp === start.propIndex && wa.fromStart === start.start &&
      wa.toProp === word.propIndex && wa.toStart === word.start);
    if (isDuplicate) return 'duplicate';
    DA_STATE.pushUndo('add arrow');
    DA_STATE.wordArrows.push({
      fromProp: start.propIndex,
      fromStart: start.start,
      fromEnd: start.end,
      toProp: word.propIndex,
      toStart: word.start,
      toEnd: word.end
    });
    return 'created';
  },

  initWorkspaceMouseHandlers: function(propositionsContainer, bracketCanvas, wordArrowsSvg) {
    if (propositionsContainer) {
      // Input events are handled by rendering-engine.js to schedule visual updates.

      propositionsContainer.addEventListener('click', (e) => {
        if (DA_STATE.selectedArrowIdx !== null && !e.target.closest('.arrow-anchor')) {
          DA_STATE.selectedArrowIdx = null;
          if (window.renderAll) window.renderAll();
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
            // Assumes getCommentById is accessible or defined elsewhere. We should use DA_STATE directly.
            const c = DA_STATE.comments.find(cm => cm.id === commentId);
            if (c && c.target) {
              DA_UI.showCommentPopoverForText(c.target.propIndex, c.target.start, c.target.end, c.id);
            }
          }
        }
      });

      // Arrow mode mouse handlers
      propositionsContainer.addEventListener('mousemove', (e) => {
        if (!DA_STATE.arrowMode) return;
        // getWordAtPoint logic needs to be moved here or made globally accessible.
        const word = window.DA_MOUSE.getWordAtPoint(e);
        if (word) {
          if (!_arrowHighlight) {
            _arrowHighlight = document.createElement('div');
            _arrowHighlight.className = 'word-highlight-overlay';
            document.body.appendChild(_arrowHighlight);
          }
          _arrowHighlight.style.left = word.rect.left + window.scrollX + 'px';
          _arrowHighlight.style.top = word.rect.top + window.scrollY + 'px';
          _arrowHighlight.style.width = word.rect.width + 'px';
          _arrowHighlight.style.height = word.rect.height + 'px';
          _arrowHighlight.style.display = 'block';
          _arrowHighlight.classList.toggle('pending', !!DA_STATE.pendingArrowStart);
        } else {
          window.DA_MOUSE.hideArrowHighlight();
        }
      });

      propositionsContainer.addEventListener('mouseleave', () => {
        window.DA_MOUSE.hideArrowHighlight();
      });

      propositionsContainer.addEventListener('mousedown', (e) => {
        if (!DA_STATE.arrowMode) return;
        if (e.target.closest('.parallel-text')) {
          DA_UI.showStatus('Word arrows are not supported in the parallel column.', 'warning');
          return;
        }
        const word = window.DA_MOUSE.getWordAtPoint(e);
        if (!word) return;

        if (!DA_STATE.pendingArrowStart) {
          DA_STATE.pendingArrowStart = word;
          DA_UI.showStatus('Start word selected. Now click the target word.', 'success');
        } else {
          const outcome = window.DA_MOUSE.completeArrow(DA_STATE.pendingArrowStart, word);
          if (outcome === 'created') {
            if (window.renderAll) window.renderAll();
            DA_UI.showStatus('Arrow created.', 'success');
          } else if (outcome === 'duplicate') {
            DA_UI.showStatus('An identical arrow already exists.', 'warning');
          } else {
            DA_UI.showStatus('Arrow cancelled.', 'info');
          }
        }
      });

      propositionsContainer.addEventListener('contextmenu', (e) => {
        const target = DA_UI.getPropositionSelection();
        if (!target) return;
        e.preventDefault();
        DA_UI.showTextContextMenu(target.propIndex, target.start, target.end, e.clientY, e.clientX, target.pcol);
      });
    }

    if (bracketCanvas) {
      bracketCanvas.addEventListener('click', (e) => {
        const node = e.target.closest('.connection-node');
        if (node) {
          const idx = parseInt(node.dataset.bracketIdx, 10);
          const b = DA_STATE.brackets[idx];
          if (!b) return;
          // A collapsed node advertises zoom-in, so clicking it expands the
          // section. Mid-connection (step 1) it stays a connect target so a
          // collapsed bracket can be bracketed without expanding it first.
          if (b.isCollapsed && DA_STATE.bracketSelectStep === 0) {
            DA_EDITOR.toggleBracketCollapse(idx);
            return;
          }
          DA_EDITOR.handleDotClick(b.id, e.clientX, e.clientY);
          return;
        }

        const group = e.target.closest('.bracket-group');
        if (group) {
          const bIdx = parseInt(group.dataset.index, 10);
          DA_UI.showLabelPicker(bIdx, e.clientY, e.clientX);
          return;
        }
      });

      bracketCanvas.addEventListener('contextmenu', (e) => {
        const group = e.target.closest('.bracket-group');
        if (group) {
          e.preventDefault();
          const bIdx = parseInt(group.dataset.index, 10);
          DA_UI.showBracketActions(bIdx, e.clientY, e.clientX);
        }
      });

      // Keyboard activation for the focusable SVG targets (connection nodes and
      // bracket lines get tabindex/role=button in renderBrackets): Enter/Space
      // does what a click does.
      bracketCanvas.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;

        const node = e.target.closest?.('.connection-node');
        if (node) {
          e.preventDefault();
          const idx = parseInt(node.dataset.bracketIdx, 10);
          const b = DA_STATE.brackets[idx];
          if (b) {
            // Same rule as the click handler: a collapsed node expands unless
            // a connection is already in progress.
            if (b.isCollapsed && DA_STATE.bracketSelectStep === 0) {
              DA_EDITOR.toggleBracketCollapse(idx);
              return;
            }
            const rect = node.getBoundingClientRect();
            DA_EDITOR.handleDotClick(b.id, rect.left + rect.width / 2, rect.top + rect.height / 2);
          }
          return;
        }

        const hit = e.target.closest?.('.bracket-hitbox');
        if (hit) {
          e.preventDefault();
          const bIdx = parseInt(hit.dataset.index, 10);
          const rect = hit.getBoundingClientRect();
          DA_UI.showLabelPicker(bIdx, rect.top + rect.height / 2, rect.right + 40);
        }
      });
    }

    if (wordArrowsSvg) {
      wordArrowsSvg.addEventListener('click', (e) => {
        const group = e.target.closest('.word-arrow-group');
        if (group) {
          const i = parseInt(group.dataset.index, 10);
          if (!isNaN(i)) {
            DA_STATE.selectedArrowIdx = (DA_STATE.selectedArrowIdx === i) ? null : i;
            if (window.renderAll) window.renderAll();
          }
        } else {
          if (DA_STATE.selectedArrowIdx !== null) {
            DA_STATE.selectedArrowIdx = null;
            if (window.renderAll) window.renderAll();
          }
        }
      });

      wordArrowsSvg.addEventListener('contextmenu', (e) => {
        const group = e.target.closest('.word-arrow-group');
        if (!group) return;
        e.preventDefault();
        const i = parseInt(group.dataset.index, 10);
        if (isNaN(i)) return;
        DA_STATE.selectedArrowIdx = i;
        if (window.renderAll) window.renderAll();
        DA_UI.showArrowActions(i, e.clientY, e.clientX);
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
  },

  initSidebarMouseHandlers: function(commentsPreview) {
    if (!commentsPreview) return;

    commentsPreview.addEventListener('click', (e) => {
      const card = e.target.closest('.comments-preview-card');
      if (!card) return;
      const commentId = card.dataset.commentId;
      const comment = DA_STATE.comments.find(c => c.id === commentId);
      if (!comment) return;

      if (e.target.closest('.send-reply-btn') || e.target.closest('.reply-input')) {
        if (e.target.closest('.send-reply-btn')) {
          const input = card.querySelector('.reply-input');
          DA_UI.addReplyToComment(comment, input?.value);
        }
        return;
      }

      if (comment.type === 'text') {
        const block = document.querySelector(`.proposition-block[data-index="${comment.target.propIndex}"]`);
        if (block) {
          block.scrollIntoView({ behavior: 'smooth', block: 'center' });
          block.classList.add('searching');
          setTimeout(() => block.classList.remove('searching'), 2000);
          DA_UI.showCommentPopoverForText(comment.target.propIndex, comment.target.start, comment.target.end, comment.id);
        }
      } else if (comment.type === 'bracket') {
        const bracketIdx = DA_STATE.bracketIndexById(comment.target.bracketId);
        const bracketGroup = document.querySelector(`.bracket-group[data-index="${bracketIdx}"]`);
        if (bracketGroup) {
          bracketGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
          bracketGroup.classList.add('bracket-hover');
          setTimeout(() => bracketGroup.classList.remove('bracket-hover'), 2000);
          if (DA_STATE.brackets[bracketIdx]) DA_UI.showCommentPopoverForBracket(bracketIdx);
        }
      }
    });

    commentsPreview.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('reply-input')) {
        const card = e.target.closest('.comments-preview-card');
        const comment = DA_STATE.comments.find(c => c.id === card.dataset.commentId);
        DA_UI.addReplyToComment(comment, e.target.value);
      }
    });
  },

  getWordAtPoint: function(e) {
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

    // Word arrows anchor the PRIMARY text only. A point inside a parallel cell
    // must not resolve to a word: the offsets below are measured from the
    // primary span's start, so a cell hit would store garbage anchors (the
    // arrow "exists" but never draws anywhere sensible).
    if (range.startContainer.parentElement?.closest('.parallel-text')) return null;

    const node = range.startContainer;
    const text = node.textContent;
    const offset = range.startOffset;

    let start = offset, end = offset;
    const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch);
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;

    if (start === end) return null;

    let block = node.parentElement;
    while (block && !block.classList.contains('proposition-block')) block = block.parentElement;
    if (!block) return null;

    const propIndex = parseInt(block.dataset.index);
    const textSpan = block.querySelector('.proposition-text');

    if (!textSpan.firstChild) return null;
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
};
