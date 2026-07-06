/**
 * ui-comments — comment popover UI (create/edit/anchor comment bubbles).
 *
 * Split out of ui.js. Classic (non-module) script: top-level functions stay
 * global like the rest of the app; the public ones are added to window.DA_UI
 * via Object.assign. Loaded after ui.js in index.html.
 */

function showCommentPopover(config) {
  const { propIndex, start, end, bracketIdx, existingCommentId } = config;
  const isBracket = bracketIdx !== undefined;
  
  const existing = document.getElementById('commentPopover');
  if (existing) {
    existing.remove();
    DA_STATE.activeCommentTarget = null;
  }

  // Set active target for highlighting while popover is open. Bracket targets
  // use the stable id (not the array index) so the highlight can't drift to a
  // different bracket if the array is reordered mid-popover (e.g. cloud update).
  DA_STATE.activeCommentTarget = isBracket
    ? { type: 'bracket', bracketId: DA_STATE.brackets[bracketIdx]?.id }
    : { type: 'text', propIndex, start, end };
  if (window.renderAll) window.renderAll();

  const template = document.getElementById('commentPopoverTemplate');
  const popover = document.createElement('div');
  popover.id = 'commentPopover';
  popover.className = 'comment-popover';
  popover.style.width = '640px'; 
  popover.appendChild(template.content.cloneNode(true));
  
  let comment = existingCommentId ? DA_STATE.comments.find(c => c.id === existingCommentId) : null;
  
  const formatDate = (ts) => {
    if (!ts) return 'Unknown Date';
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 'Unknown Date' : d.toLocaleString();
  };

  // Calculate target description for the header
  let targetDesc = isBracket ? 'Bracket Comment' : 'Text Comment';
  const chapterMatch = (DA_STATE.passageRef || '').match(/(\d+):/);
  const chapter = chapterMatch ? chapterMatch[1] : '';

  if (isBracket) {
    const b = DA_STATE.brackets[bracketIdx];
    const extent = DA_RENDERER.getBracketExtent(bracketIdx);
    const v1 = DA_RENDERER.computeVerseDisplay(extent.from) || '?';
    const v2 = DA_RENDERER.computeVerseDisplay(extent.to) || '?';
    const vsRange = v1 === v2 ? v1 : `${v1}-${v2}`;
    const fullRef = chapter ? `${chapter}:${vsRange}` : vsRange;
    targetDesc = `Bracket (${fullRef}): ${b ? formatBracketType(b.type) : 'Unknown'}`;
  } else if (propIndex !== undefined) {
    const verse = DA_RENDERER.computeVerseDisplay(propIndex) || '?';
    const fullRef = chapter ? `${chapter}:${verse}` : verse;
    const text = DA_STATE.propositions[propIndex] || '';
    const snippet = text.substring(start, end);
    targetDesc = `${fullRef}: "${snippet}"`;
  }

  popover.querySelector('.popover-title').textContent = targetDesc;

  const renderContent = () => {
    const displayArea = popover.querySelector('.comment-display');
    const newArea = popover.querySelector('.new-comment-area');
    const repliesSection = popover.querySelector('.replies-section');

    if (comment) {
      displayArea.style.display = 'block';
      newArea.style.display = 'none';
      repliesSection.style.display = 'block';

      popover.querySelector('.comment-author').textContent = comment.author || 'Anonymous';
      popover.querySelector('.comment-time').textContent = formatDate(comment.timestamp || comment.createdAt);
      popover.querySelector('.comment-text').innerHTML = renderCommentText(comment.text);
      popover.querySelector('.comment-edit-area textarea').value = comment.text;

      const repliesList = popover.querySelector('.replies-list');
      repliesList.innerHTML = '';
      const replyTemplate = document.getElementById('replyItemTemplate');

      (comment.replies || []).forEach((r, rIdx) => {
        const replyEl = /** @type {DocumentFragment} */ (replyTemplate.content.cloneNode(true)).querySelector('.reply-item');
        replyEl.dataset.idx = rIdx;
        replyEl.querySelector('.comment-author').textContent = r.author || 'Anonymous';
        replyEl.querySelector('.comment-time').textContent = formatDate(r.timestamp || r.createdAt);
        replyEl.querySelector('.comment-text').innerHTML = renderCommentText(r.text);
        replyEl.querySelector('textarea').value = r.text;

        const rDisplay = replyEl.querySelector('.comment-text');
        const rEditArea = replyEl.querySelector('.reply-edit-area');
        const rTextarea = rEditArea.querySelector('textarea');
        attachFormatShortcuts(rTextarea);

        replyEl.querySelector('.edit-reply-btn').onclick = () => {
          rDisplay.style.display = 'none';
          rEditArea.style.display = 'block';
        };

        replyEl.querySelector('.cancel-reply-btn').onclick = () => {
          rDisplay.style.display = 'block';
          rEditArea.style.display = 'none';
        };

        replyEl.querySelector('.save-reply-btn').onclick = () => {
          const newText = rEditArea.querySelector('textarea').value.trim();
          if (!newText) return;
          DA_STATE.pushUndo('edit reply');
          r.text = newText;
          r.timestamp = Date.now();
          renderContent();
          if (window.renderAll) window.renderAll();
        };

        replyEl.querySelector('.delete-reply-btn').onclick = () => {
          if (!confirm('Delete this reply?')) return;
          DA_STATE.pushUndo('delete reply');
          comment.replies.splice(rIdx, 1);
          renderContent();
          if (window.renderAll) window.renderAll();
        };

        repliesList.appendChild(replyEl);
      });
    } else {
      displayArea.style.display = 'none';
      repliesSection.style.display = 'none';
      newArea.style.display = 'block';
    }
  };

  const attachFormatShortcuts = (textarea) => {
    textarea.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'b') { e.preventDefault(); applyFormatting(textarea, '**'); }
      else if (e.key === 'i') { e.preventDefault(); applyFormatting(textarea, '*'); }
      else if (e.key === 'u') { e.preventDefault(); applyFormatting(textarea, '__'); }
    });
  };

  const attachListeners = () => {
    attachFormatShortcuts(popover.querySelector('.new-comment-area textarea'));
    attachFormatShortcuts(popover.querySelector('.comment-edit-area textarea'));

    popover.querySelector('.close-btn').onclick = () => {
      DA_STATE.activeCommentTarget = null;
      if (window.renderAll) window.renderAll();
      popover.remove();
    };

    popover.querySelector('.save-new-btn').onclick = () => {
      const text = popover.querySelector('.new-comment-area textarea').value.trim();
      if (!text) return;
      DA_STATE.pushUndo('add comment');
      const newComment = {
        id: Date.now().toString(),
        author: localStorage.getItem(DA_CONSTANTS.REVIEWER_NAME_KEY) || 'Anonymous',
        text,
        timestamp: Date.now(),
        type: isBracket ? 'bracket' : 'text',
        // Bracket comments anchor to the bracket's stable id, so they survive
        // other brackets being added/deleted without any index fix-ups.
        target: isBracket ? { bracketId: DA_STATE.brackets[bracketIdx]?.id } : { propIndex, start, end },
        replies: []
      };
      DA_STATE.comments.push(newComment);
      comment = newComment;
      renderContent();
      if (window.renderAll) window.renderAll();
    };

    const display = popover.querySelector('.comment-display');
    const editArea = popover.querySelector('.comment-edit-area');
    
    popover.querySelector('.edit-btn').onclick = () => {
      display.style.display = 'none';
      editArea.style.display = 'block';
    };
    
    popover.querySelector('.cancel-btn').onclick = () => {
      display.style.display = 'block';
      editArea.style.display = 'none';
    };
    
    popover.querySelector('.save-btn').onclick = () => {
      const text = editArea.querySelector('textarea').value.trim();
      if (!text) return;
      DA_STATE.pushUndo('edit comment');
      comment.text = text;
      comment.timestamp = Date.now();
      editArea.style.display = 'none';
      renderContent();
      if (window.renderAll) window.renderAll();
    };
    
    popover.querySelector('.delete-btn').onclick = () => {
      if (!confirm('Delete this comment?')) return;
      DA_STATE.pushUndo('delete comment');
      DA_STATE.comments = DA_STATE.comments.filter(c => c.id !== comment.id);
      DA_STATE.activeCommentTarget = null;
      popover.remove();
      if (window.renderAll) window.renderAll();
    };
    
    const replyInput = popover.querySelector('.reply-input');
    const sendBtn = popover.querySelector('.send-reply-btn');
    
    const submitReply = () => {
      if (!addReplyToComment(comment, replyInput.value)) return;
      replyInput.value = '';
      renderContent();
    };

    if (sendBtn) sendBtn.onclick = submitReply;
    if (replyInput) {
      replyInput.onkeydown = (e) => {
        if (e.key === 'Enter') submitReply();
      };
    }
  };

  const wrapper = document.getElementById('propositions')?.parentElement || document.body;

  // Standardize position for all comment popovers: always center horizontally, 
  // and set to a consistent vertical position (28% is slightly lower than the old 20%).
  popover.style.left = '50%';
  popover.style.top = '28%';
  popover.style.transform = 'translateX(-50%)';

  attachListeners();
  renderContent();
  
  wrapper.appendChild(popover);
  makePopupDraggable(popover, '.popover-header');
  if (typeof makeCommentPopoverDraggableAndResizable === 'function') {
    makeCommentPopoverDraggableAndResizable(popover);
  }
  manageDialogFocus(popover);
  setupClickOutside(popover, () => {
    DA_STATE.activeCommentTarget = null;
    if (window.renderAll) window.renderAll();
    popover.remove();
  });
}

function showCommentPopoverForText(propIndex, start, end, existingCommentId = null) {
  showCommentPopover({ propIndex, start, end, existingCommentId });
}

function showCommentPopoverForBracket(bracketIdx) {
  const comment = getCommentForBracket(bracketIdx);
  showCommentPopover({ bracketIdx, existingCommentId: comment?.id });
}

window.DA_UI = Object.assign(window.DA_UI || {}, {
  showCommentPopover, showCommentPopoverForText, showCommentPopoverForBracket
});
