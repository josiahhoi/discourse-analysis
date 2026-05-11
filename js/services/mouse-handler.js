window.DA_MOUSE = {
  initWorkspaceMouseHandlers: function(propositionsContainer, bracketCanvas, wordArrowsSvg) {
    if (propositionsContainer) {
      // Sync text changes back to state as the user types
      propositionsContainer.addEventListener('input', (e) => {
        const textSpan = e.target.closest('.proposition-text');
        if (!textSpan) return;
        const block = textSpan.closest('.proposition-block');
        if (!block) return;
        const i = parseInt(block.dataset.index, 10);
        DA_STATE.propositions[i] = textSpan.innerText;
      });

      // Prop dot clicks and comment highlights
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
          if (!window.arrowHighlight) {
            window.arrowHighlight = document.createElement('div');
            window.arrowHighlight.className = 'word-highlight-overlay';
            document.body.appendChild(window.arrowHighlight);
          }
          window.arrowHighlight.style.left = word.rect.left + window.scrollX + 'px';
          window.arrowHighlight.style.top = word.rect.top + window.scrollY + 'px';
          window.arrowHighlight.style.width = word.rect.width + 'px';
          window.arrowHighlight.style.height = word.rect.height + 'px';
          window.arrowHighlight.style.display = 'block';
          window.arrowHighlight.classList.toggle('pending', typeof pendingArrowStart !== 'undefined' && pendingArrowStart !== null);
        } else {
          if (window.arrowHighlight) window.arrowHighlight.style.display = 'none';
        }
      });

      propositionsContainer.addEventListener('mouseleave', () => {
        if (window.arrowHighlight) window.arrowHighlight.style.display = 'none';
      });

      propositionsContainer.addEventListener('mousedown', (e) => {
        if (!DA_STATE.arrowMode) return;
        const word = window.DA_MOUSE.getWordAtPoint(e);
        if (!word) return;

        if (!window.pendingArrowStart) {
          window.pendingArrowStart = word;
          DA_UI.showStatus('Start word selected. Now click the target word.', 'success');
        } else {
          if (window.pendingArrowStart.propIndex === word.propIndex && window.pendingArrowStart.start === word.start) {
            window.pendingArrowStart = null;
            DA_UI.showStatus('Arrow cancelled.', 'info');
            return;
          }
          DA_STATE.pushUndo('add arrow');
          DA_STATE.wordArrows.push({
            fromProp: window.pendingArrowStart.propIndex,
            fromStart: window.pendingArrowStart.start,
            fromEnd: window.pendingArrowStart.end,
            toProp: word.propIndex,
            toStart: word.start,
            toEnd: word.end
          });
          window.pendingArrowStart = null;
          if (window.renderAll) window.renderAll();
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
        
        e.preventDefault();
        
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

    if (bracketCanvas) {
      bracketCanvas.addEventListener('click', (e) => {
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

      if (e.target.closest('.delete-comment-btn')) {
        if (confirm('Delete this comment?')) {
          DA_STATE.pushUndo('delete comment');
          DA_STATE.comments = DA_STATE.comments.filter(c => c.id !== commentId);
          if (window.renderAll) window.renderAll();
        }
        return;
      }

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
            if (window.renderAll) window.renderAll();
          }
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
        const bracketIdx = comment.target.bracketIdx;
        const bracketGroup = document.querySelector(`.bracket-group[data-index="${bracketIdx}"]`);
        if (bracketGroup) {
          bracketGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
          bracketGroup.classList.add('bracket-hover');
          setTimeout(() => bracketGroup.classList.remove('bracket-hover'), 2000);

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
          if (window.renderAll) window.renderAll();
        }
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

    const node = range.startContainer;
    const text = node.textContent;
    const offset = range.startOffset;

    let start = offset, end = offset;
    while (start > 0 && /\w/.test(text[start - 1])) start--;
    while (end < text.length && /\w/.test(text[end])) end++;

    if (start === end) return null;

    let block = node.parentElement;
    while (block && !block.classList.contains('proposition-block')) block = block.parentElement;
    if (!block) return null;

    const propIndex = parseInt(block.dataset.index);
    const textSpan = block.querySelector('.proposition-text');

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
