/**
 * render-comments — comment-preview marker layer (renderCommentPreviews).
 *
 * Extracted from rendering-engine.js. This is a classic (non-module) script:
 * its top-level functions stay in the global scope like the rest of the app, and
 * it contributes its public function(s) to the shared window.DA_RENDERER
 * namespace. Loaded after rendering-engine.js in index.html.
 */

function renderCommentPreviews() {
  const sidebar = document.getElementById('commentsPreview');
  const list = document.getElementById('commentsPreviewList');
  if (!sidebar || !list) return;

  // Fold/unfold via the shared collapse animation (styles.css) rather than
  // display, which would kill the transition.
  sidebar.classList.toggle('comments-collapsed', !DA_STATE.showCommentsEnabled);
  if (!DA_STATE.showCommentsEnabled) return;
  
  const existingCards = Array.from(list.children);
  const targetCount = DA_STATE.comments.length;

  // Remove excess cards
  while (existingCards.length > targetCount) {
    existingCards.pop().remove();
  }

  DA_STATE.comments.forEach((comment, i) => {
    let card = existingCards[i];
    if (!card) {
      card = document.createElement('div');
      card.className = 'comments-preview-card';
      list.appendChild(card);
    }
    card.dataset.commentId = comment.id;
    
    const chapterMatch = (DA_STATE.passageRef || '').match(/(\d+):/);
    const chapter = chapterMatch ? chapterMatch[1] : '';

    let targetDesc = '';
    if (comment.type === 'text') {
      const propIdx = comment.target.propIndex;
      const verse = computeVerseDisplay(propIdx) || '?';
      const fullRef = chapter ? `${chapter}:${verse}` : verse;
      const text = DA_STATE.propositions[propIdx] || '';
      const snippet = text.substring(comment.target.start, comment.target.end);
      targetDesc = `${fullRef}: "${snippet}"`;
    } else {
      const bIdx = DA_STATE.bracketIndexById(comment.target.bracketId);
      const b = DA_STATE.brackets[bIdx];
      const extent = getBracketExtent(bIdx);
      const v1 = computeVerseDisplay(extent.from) || '?';
      const v2 = computeVerseDisplay(extent.to) || '?';
      const vsRange = v1 === v2 ? v1 : `${v1}-${v2}`;
      const fullRef = chapter ? `${chapter}:${vsRange}` : vsRange;
      targetDesc = `Bracket (${fullRef}): ${b ? DA_UI.formatBracketType(b.type) : 'Unknown'}`;
    }

    const newHtml = `
      <div class="comment-card-header">
        <span class="comment-target">${DA_UI.escapeHtml(targetDesc)}</span>
      </div>
      <div class="comment-author">${DA_UI.escapeHtml(comment.author)}</div>
      <div class="comment-text">${DA_UI.renderCommentText(comment.text)}</div>
      <div class="comment-replies">
        ${(comment.replies || []).map(r => `
          <div class="reply">
            <span class="reply-author">${DA_UI.escapeHtml(r.author)}:</span>
            <span class="reply-text">${DA_UI.renderCommentText(r.text)}</span>
          </div>
        `).join('')}
      </div>
      <div class="reply-input-row">
        <input type="text" placeholder="Reply..." class="reply-input" data-id="${comment.id}">
        <button class="send-reply-btn" data-id="${comment.id}" title="Send reply">→</button>
      </div>
    `;
    
    if (card._lastHtml !== newHtml) {
      card.innerHTML = newHtml;
      card._lastHtml = newHtml;
    }
  });

  // Card hover → corresponding highlight glow (set up once on the list container)
  if (!list._commentCardHoverListenersAttached) {
    list._commentCardHoverListenersAttached = true;
    let _hoveredCardId = null;

    const _clearHighlightHover = () => {
      document.querySelectorAll('mark.comment-highlight.comment-highlight-card-hover')
        .forEach(el => el.classList.remove('comment-highlight-card-hover'));
      document.querySelectorAll('.bracket-group.comment-card-hover')
        .forEach(el => el.classList.remove('comment-card-hover'));
    };

    list.addEventListener('mouseover', (e) => {
      const card = e.target.closest('.comments-preview-card');
      const newId = card?.dataset.commentId ?? null;
      if (newId === _hoveredCardId) return;
      _hoveredCardId = newId;
      _clearHighlightHover();
      if (!newId) return;
      const comment = DA_STATE.comments.find(c => c.id === newId);
      if (!comment) return;
      if (comment.type === 'text') {
        document.querySelectorAll(`mark.comment-highlight[data-comment-id="${newId}"]`)
          .forEach(el => el.classList.add('comment-highlight-card-hover'));
      } else {
        const bracketIdx = DA_STATE.bracketIndexById(comment.target?.bracketId);
        if (bracketIdx !== -1) {
          const group = document.querySelector(`.bracket-group[data-index="${bracketIdx}"]`);
          if (group) group.classList.add('comment-card-hover');
        }
      }
    });

    list.addEventListener('mouseleave', () => {
      _hoveredCardId = null;
      _clearHighlightHover();
    });
  }
}

window.DA_RENDERER = Object.assign(window.DA_RENDERER || {}, { renderCommentPreviews });
